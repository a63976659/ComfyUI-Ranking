"""进程树保护及启动门闩；仅标准库，无业务/宿主依赖。"""
import asyncio
import ctypes
import os
from pathlib import Path
import signal
import subprocess
import sys
import threading
import time


class BasicLimits(ctypes.Structure):
    _fields_=[('process_time',ctypes.c_int64),('job_time',ctypes.c_int64),
        ('flags',ctypes.c_uint32),('minimum',ctypes.c_size_t),('maximum',ctypes.c_size_t),
        ('active_limit',ctypes.c_uint32),('affinity',ctypes.c_size_t),
        ('priority',ctypes.c_uint32),('scheduling',ctypes.c_uint32)]


class IoCounters(ctypes.Structure):
    _fields_=[(name,ctypes.c_uint64) for name in ('read_ops','write_ops','other_ops',
                                               'read_bytes','write_bytes','other_bytes')]


class ExtendedLimits(ctypes.Structure):
    _fields_=[('basic',BasicLimits),('io',IoCounters),('process_memory',ctypes.c_size_t),
        ('job_memory',ctypes.c_size_t),('peak_process',ctypes.c_size_t),('peak_job',ctypes.c_size_t)]


class Accounting(ctypes.Structure):
    _fields_=[(name,ctypes.c_int64) for name in ('user','kernel','period_user','period_kernel')]+[
        ('faults',ctypes.c_uint32),('total',ctypes.c_uint32),('active',ctypes.c_uint32),
        ('terminated',ctypes.c_uint32)]


def _windows_job_limits(*,process_memory_bytes=None,job_memory_bytes=None,active_process_limit=None):
    """提交内存与活跃进程限制；省略参数保持安装Job原行为。"""
    maximum_size=(1 << (ctypes.sizeof(ctypes.c_size_t)*8))-1
    for value,maximum in ((process_memory_bytes,maximum_size),(job_memory_bytes,maximum_size),
                          (active_process_limit,(1 << 32)-1)):
        if value is not None and (type(value) is not int or not 0<value<=maximum):
            raise ValueError('invalid process job budget')
    limits=ExtendedLimits();limits.basic.flags=0x2000  # KILL_ON_JOB_CLOSE，无breakaway。
    if process_memory_bytes is not None:
        limits.basic.flags|=0x100;limits.process_memory=process_memory_bytes
    if job_memory_bytes is not None:
        limits.basic.flags|=0x200;limits.job_memory=job_memory_bytes
    if active_process_limit is not None:
        limits.basic.flags|=0x8;limits.basic.active_limit=active_process_limit
    return limits


class WindowsProcessJob:
    """父进程唯一持有非继承Job句柄；父进程死亡由内核终止成员。"""
    def __init__(self,*,process_memory_bytes=None,job_memory_bytes=None,active_process_limit=None):
        limits=_windows_job_limits(process_memory_bytes=process_memory_bytes,
            job_memory_bytes=job_memory_bytes,active_process_limit=active_process_limit)
        if sys.platform!='win32': raise OSError('Windows process jobs unavailable')
        kernel=ctypes.WinDLL('kernel32',use_last_error=True)
        self.kernel=kernel; self.handle=None
        self._limits=limits;self._members={};self._termination_started=False
        signatures={
            'CreateJobObjectW':([ctypes.c_void_p,ctypes.c_wchar_p],ctypes.c_void_p),
            'SetInformationJobObject':([ctypes.c_void_p,ctypes.c_int,ctypes.c_void_p,ctypes.c_uint32],ctypes.c_int),
            'QueryInformationJobObject':([ctypes.c_void_p,ctypes.c_int,ctypes.c_void_p,ctypes.c_uint32,ctypes.c_void_p],ctypes.c_int),
            'OpenProcess':([ctypes.c_uint32,ctypes.c_int,ctypes.c_uint32],ctypes.c_void_p),
            'AssignProcessToJobObject':([ctypes.c_void_p,ctypes.c_void_p],ctypes.c_int),
            'TerminateJobObject':([ctypes.c_void_p,ctypes.c_uint32],ctypes.c_int),
            'IsProcessInJob':([ctypes.c_void_p,ctypes.c_void_p,ctypes.POINTER(ctypes.c_int)],ctypes.c_int),
            'WaitForSingleObject':([ctypes.c_void_p,ctypes.c_uint32],ctypes.c_uint32),
            'CloseHandle':([ctypes.c_void_p],ctypes.c_int)}
        for name,(arguments,result) in signatures.items():
            function=getattr(kernel,name); function.argtypes=arguments; function.restype=result
        self.handle=kernel.CreateJobObjectW(None,None)
        if not self.handle: raise ctypes.WinError(ctypes.get_last_error())
        try:
            self._check(kernel.SetInformationJobObject(self.handle,9,ctypes.byref(limits),ctypes.sizeof(limits)))
        except BaseException:
            self.close(); raise

    @staticmethod
    def _check(result):
        if not result: raise ctypes.WinError(ctypes.get_last_error())

    def assign(self,pid):
        process=self.kernel.OpenProcess(0x0100|0x0001,False,pid)  # SET_QUOTA|TERMINATE
        if not process: raise ctypes.WinError(ctypes.get_last_error())
        try: self._check(self.kernel.AssignProcessToJobObject(self.handle,process))
        finally: self._check(self.kernel.CloseHandle(process))

    def _retain_members(self):
        capacity=16
        while True:
            class ProcessIds(ctypes.Structure):
                _fields_=[('assigned',ctypes.c_uint32),('count',ctypes.c_uint32),
                    ('ids',ctypes.c_size_t*capacity)]
            info=ProcessIds()
            result=self.kernel.QueryInformationJobObject(
                self.handle,3,ctypes.byref(info),ctypes.sizeof(info),None)
            if result and info.count<=capacity:break
            error=ctypes.get_last_error()
            if not result and error!=234:raise ctypes.WinError(error)
            capacity=max(capacity*2,info.assigned)
            if capacity>4096:raise OSError('process job member budget exceeded')
        for pid in info.ids[:info.count]:
            if pid in self._members:continue
            process=self.kernel.OpenProcess(0x00100000|0x1000,False,pid)
            if not process:
                error=ctypes.get_last_error()
                if error==87:continue
                raise ctypes.WinError(error)
            retained=False
            try:
                member=ctypes.c_int()
                self._check(self.kernel.IsProcessInJob(process,self.handle,ctypes.byref(member)))
                if member.value:
                    self._members[pid]=process;retained=True
            finally:
                if not retained:self._check(self.kernel.CloseHandle(process))

    def active(self):
        if self.handle is None:return 0
        info=Accounting()
        self._check(self.kernel.QueryInformationJobObject(
            self.handle,1,ctypes.byref(info),ctypes.sizeof(info),None))
        pending=0
        for pid,process in tuple(self._members.items()):
            status=self.kernel.WaitForSingleObject(process,0)
            if status==258:pending+=1
            elif status==0:
                self._check(self.kernel.CloseHandle(process));del self._members[pid]
            else:raise ctypes.WinError(ctypes.get_last_error())
        return max(info.active,pending)

    def terminate(self):
        if self.handle is None:return
        try:
            try:
                if not self._termination_started:
                    self._limits.basic.flags|=0x8
                    self._limits.basic.active_limit=1
                    self._check(self.kernel.SetInformationJobObject(
                        self.handle,9,ctypes.byref(self._limits),ctypes.sizeof(self._limits)))
                    self._retain_members()
                    self._termination_started=True
            finally:
                self._check(self.kernel.TerminateJobObject(self.handle,1))
        except BaseException:
            self.close()
            raise

    def close(self):
        error=None
        if self.handle is not None:
            try:
                self._check(self.kernel.CloseHandle(self.handle));self.handle=None
            except OSError as caught:error=caught
        for pid,process in tuple(self._members.items()):
            try:
                self._check(self.kernel.CloseHandle(process));del self._members[pid]
            except OSError as caught:
                if error is None:error=caught
        if error is not None:raise error


def linux_group_members(group):
    """僵尸不再写文件；无法确认的成员仍视为活跃，不能提前清理暂存。"""
    members=[]
    try: entries=list(Path('/proc').iterdir())
    except OSError: return None
    for entry in entries:
        if not entry.name.isdecimal(): continue
        try:
            if os.getpgid(int(entry.name)) != group: continue
            fields=(entry/'stat').read_text().rsplit(')',1)[1].split()
            if int(fields[2]) == group and fields[0] not in {'Z','X','x'}:
                members.append(int(entry.name))
        except ProcessLookupError:
            continue
        except FileNotFoundError:
            continue
        except (OSError,ValueError,IndexError):
            # 未知身份不能当作空进程组，也不能凭猜测向该PID发信号。
            return None
    return members


def linux_group_active(group):
    members=linux_group_members(group)
    return members is None or bool(members)


class LinuxProcessGroup:
    """独立会话中的合作子进程；拥有者管道不交给目标命令。"""
    def __init__(self,process,owner_fd):
        self.process=process; self.owner_fd=owner_fd; self.group=process.pid
    def __getattr__(self,name): return getattr(self.process,name)
    def kill(self):
        # EOF交给仍持有暂存flock的门闩处理；不能先杀掉锁拥有者。
        if self.owner_fd is None: return
        os.close(self.owner_fd); self.owner_fd=None
    async def finish_tree(self):
        self.kill()
        await self.process.wait()


def stop_linux_children(group):
    while True:
        members=linux_group_members(group)
        if members is not None:
            children=[pid for pid in members if pid!=group]
            if not children: return
            for pid in children:
                try: os.kill(pid,signal.SIGKILL)
                except ProcessLookupError: pass
        time.sleep(.05)


def linux_main(arguments):
    if len(arguments)<3: return 125
    command=arguments[2:]
    stdio=command[:1]==['--stdio']
    if stdio: command=command[1:]
    if not command: return 125
    try:
        owner_fd=int(arguments[1])
        if owner_fd<3 or os.getpgrp()!=os.getpid() or os.getsid(0)!=os.getpid(): return 125
        if os.read(owner_fd,1)!=b'\x01': return 125
    except (OSError,ValueError): return 125

    launch_ready=threading.Event()
    cleanup_lock=threading.Lock()

    def watch_owner():
        # 使用未缓冲的独立FD，communicate()关闭stdin不会误触发拥有者退出。
        try:
            while os.read(owner_fd,1): pass
        except OSError: pass
        # 等Popen返回，避免EOF观察空组后主线程仍启动目标的窗口。
        launch_ready.wait()
        with cleanup_lock: stop_linux_children(os.getpid())
        os._exit(1)

    threading.Thread(target=watch_owner,daemon=True).start()
    try:
        options={'stdin':sys.stdin,'stdout':sys.stdout,'stderr':sys.stderr} if stdio else {'stdin':subprocess.DEVNULL}
        target=subprocess.Popen(command,close_fds=True,**options)
        launch_ready.set()
        return target.wait()
    except FileNotFoundError: return 127
    except OSError: return 126
    finally:
        # 正常命令退出也收回残留后代；门闩保持存活直到不再有文件写入者。
        # 所以stdout/退出码返回后不会留下已失去拥有者监视的孙进程。
        launch_ready.set()
        with cleanup_lock: stop_linux_children(os.getpid())



def _stdio_timeout(value):
    if type(value) not in (int,float) or not 0<value<=300:
        raise ValueError('invalid stdio timeout')
    return value


class _OwnedStdin:
    """每条输入管道只拥有一个原生关闭waiter，调用者取消不传入它。"""
    def __init__(self,stream):
        self._stream=stream;self._closed_task=None
    def __getattr__(self,name):return getattr(self._stream,name)
    async def wait_closed(self):
        if self._closed_task is None:
            async def finish():
                try:
                    await self._stream.wait_closed()
                    return True,None
                except Exception as error:return False,error
            self._closed_task=asyncio.create_task(finish())
        success,error=await asyncio.shield(self._closed_task)
        if not success:raise error


class OwnedStdioProcess:
    """所属stdio任务与整树收尾；成功close后才能释放调用方容量。"""
    def __init__(self,*,job=None,owner_fd=None):
        self.process=None;self.job=job;self.owner_fd=owner_fd;self.assigned=False
        self._tasks=set();self._close_task=None

    def create_task(self,coroutine):
        if self._close_task is not None:
            coroutine.close()
            raise RuntimeError('stdio process is closing')
        task=asyncio.create_task(coroutine)
        return self._own(task)

    def _own(self,future):
        self._tasks.add(future)
        def finished(result):
            self._tasks.discard(result)
            if not result.cancelled():result.exception()
        future.add_done_callback(finished)
        return future

    async def run_io(self,writer,reader,*,timeout=30):
        """返回(writer_result, reader_result)；异常/取消先收回同一进程。"""
        try:_stdio_timeout(timeout)
        except ValueError:
            writer.close();reader.close();raise
        if self._close_task is not None:
            writer.close();reader.close()
            raise RuntimeError('stdio process is closing')
        tasks=(self.create_task(writer),self.create_task(reader))
        group=self._own(asyncio.gather(*tasks))
        try:
            return tuple(await asyncio.wait_for(group,timeout))
        except BaseException:
            await self.close()
            raise

    async def _finish(self):
        errors=[]
        process=self.process
        if self.owner_fd is not None:
            descriptor=self.owner_fd;self.owner_fd=None
            try:os.close(descriptor)
            except OSError as error:errors.append(error)
        if self.job is not None:
            try:self.job.terminate()
            except OSError as error:
                errors.append(error)
                self.job.close()  # KILL_ON_JOB_CLOSE仍作为失败收尾。
        if process is not None and process.returncode is None and not self.assigned:
            try:process.kill()
            except ProcessLookupError:pass
        tasks=tuple(self._tasks)
        for task in tasks:
            if not task.done():task.cancel()
        if tasks:await asyncio.gather(*tasks,return_exceptions=True)
        if process is not None:
            if process.stdin is not None:process.stdin.close()
            async def drain(stream):
                if stream is None:return
                while await stream.read(64*1024):await asyncio.sleep(0)
            async def close_input():
                if process.stdin is None:return
                try:await process.stdin.wait_closed()
                except (BrokenPipeError,ConnectionResetError):pass
                except asyncio.CancelledError:
                    # 前序writer可能取消了关闭waiter；收尾任务本身不受外部取消。
                    # 仍等进程及输出EOF，不能把该waiter取消当作本次收尾取消。
                    if asyncio.current_task().cancelling():raise
            # 管道暂停读取时仅wait()会挂住；分块丢弃两路输出并同时wait。
            results=await asyncio.gather(drain(process.stdout),drain(process.stderr),
                close_input(),process.wait(),return_exceptions=True)
            errors.extend(value for value in results if isinstance(value,BaseException))
        if self.job is not None:
            try:
                while self.job.active():await asyncio.sleep(.01)
            except OSError as error:errors.append(error)
            finally:self.job.close()
        if errors:raise errors[0]

    async def close(self):
        if self._close_task is None:
            async def finish():
                try:
                    await self._finish()
                    return True,None
                except Exception as error:
                    # 以数据消费错误，重复取消的shield不打印私有异常正文。
                    return False,error
            self._close_task=asyncio.create_task(finish())
        cancelled=None
        while not self._close_task.done():
            try:await asyncio.shield(self._close_task)
            except asyncio.CancelledError as error:cancelled=error
        success,error=self._close_task.result()
        if cancelled is not None:raise cancelled
        if not success:raise error


async def start_owned_stdio(script,arguments=(),*,timeout=15,
        process_memory_bytes=None,job_memory_bytes=None,active_process_limit=None):
    """仅可信本地标准库脚本；启动任务始终被拥有，不提供未保护回退。"""
    _stdio_timeout(timeout)
    budgets=dict(process_memory_bytes=process_memory_bytes,job_memory_bytes=job_memory_bytes,
        active_process_limit=active_process_limit)
    _windows_job_limits(**budgets)
    if sys.platform!='win32' and not sys.platform.startswith('linux'):
        raise OSError('protected stdio unavailable')
    if sys.platform!='win32' and any(value is not None for value in budgets.values()):
        raise OSError('Windows stdio budgets unavailable on this platform')
    script=Path(script)
    executable=getattr(sys,'_base_executable',None)
    if not script.is_absolute() or not script.is_file() or not executable or not Path(executable).is_file():
        raise ValueError('invalid standard-library stdio worker')
    if not isinstance(arguments,(tuple,list)) or any(not isinstance(value,str) or '\0' in value for value in arguments):
        raise ValueError('invalid stdio arguments')
    cancelled=asyncio.Event()
    async def launch():
        owned=OwnedStdioProcess();read_fd=None
        try:
            if cancelled.is_set():raise RuntimeError('stdio startup cancelled')
            options=dict(stdin=asyncio.subprocess.PIPE,stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,limit=64*1024)
            if sys.platform=='win32':
                owned.job=WindowsProcessJob(**budgets)
                options['creationflags']=subprocess.CREATE_NO_WINDOW
                gate=['--stdio']
            else:
                read_fd,owned.owner_fd=os.pipe()
                options.update(start_new_session=True,pass_fds=(read_fd,))
                gate=['--owner-fd',str(read_fd),'--stdio']
            command=[executable,'-I','-S',str(Path(__file__).resolve()),*gate,
                executable,'-I','-S',str(script),*arguments]
            owned.process=await asyncio.create_subprocess_exec(*command,**options)
            owned.process.stdin=_OwnedStdin(owned.process.stdin)
            if read_fd is not None:
                descriptor=read_fd;read_fd=None
                os.close(descriptor)
            if cancelled.is_set():raise RuntimeError('stdio startup cancelled')
            if owned.job is not None:
                owned.job.assign(owned.process.pid);owned.assigned=True
                owned.process.stdin.write(b'\x01');await owned.process.stdin.drain()
            else:
                # 独立owner EOF触发Linux门闩清理，不能直接杀死锁拥有者。
                owned.assigned=True
                os.write(owned.owner_fd,b'\x01')
            return True,owned
        except (Exception,asyncio.CancelledError) as error:
            if read_fd is not None:
                descriptor=read_fd;read_fd=None
                try:os.close(descriptor)
                except OSError as close_error:error=close_error
            try:await owned.close()
            except Exception as close_error:error=close_error
            return False,error
    # 不取消create_subprocess_exec：等待其返回真实句柄后再处理拥有者收尾。
    task=asyncio.create_task(launch());deadline=asyncio.get_running_loop().time()+timeout
    failure=None
    while not task.done():
        try:
            if failure is None:
                done,_=await asyncio.wait({task},timeout=max(0,deadline-asyncio.get_running_loop().time()))
                if not done:
                    failure=TimeoutError('stdio startup timed out');cancelled.set()
            else:await asyncio.shield(task)
        except asyncio.CancelledError as error:
            failure=error;cancelled.set()
    success,result=task.result()
    if failure is not None:
        if success:await result.close()
        raise failure
    if not success:raise result
    return result

def main():
    if sys.platform.startswith('linux') and sys.argv[1:2]==['--owner-fd']:
        return linux_main(sys.argv[1:])
    command=sys.argv[1:]
    stdio=command[:1]==['--stdio']
    if stdio: command=command[1:]
    if not command or (stdio and sys.platform!='win32'): return 125
    # stdio门闩只读一个原始字节，不能预读后续工作流帧到Python缓冲区。
    try:
        confirmed=os.read(sys.stdin.fileno(),1) if stdio else sys.stdin.buffer.read(1)
    except (OSError,ValueError): return 125
    # 调用者先入Job再确认；确认前EOF/坏确认不执行目标。
    if confirmed!=b'\x01': return 125
    try:
        # Windows显式传三路标准句柄，close_fds=True也只继承该句柄列表。
        options={'stdin':sys.stdin,'stdout':sys.stdout,'stderr':sys.stderr} if stdio else {'stdin':subprocess.DEVNULL}
        return subprocess.call(command,**options,close_fds=True,
            creationflags=subprocess.CREATE_NO_WINDOW if sys.platform=='win32' else 0)
    except FileNotFoundError: return 127
    except OSError: return 126


if __name__=='__main__': sys.exit(main())
