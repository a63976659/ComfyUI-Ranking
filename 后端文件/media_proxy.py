"""本机HTTP代理配置、公网解析与固定地址媒体连接。"""
import asyncio
import fnmatch
import ipaddress
import json
import os
import urllib.parse
import urllib.request

import aiohttp
from yarl import URL

DNS_URL = 'https://1.1.1.1/dns-query'
DNS_HOST = 'cloudflare-dns.com'
DNS_TIMEOUT = 8
DNS_MAX_BYTES = 16384


def _windows_bypass(host, authority):
    if os.name != 'nt':
        return False
    import winreg
    try:
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, r'Software\Microsoft\Windows\CurrentVersion\Internet Settings') as key:
            value, _ = winreg.QueryValueEx(key, 'ProxyOverride')
    except OSError:
        return False
    if not isinstance(value, str):
        return False
    for pattern in value.lower().split(';'):
        pattern = pattern.strip()
        if pattern == '<local>' and '.' not in host:
            return True
        if pattern and pattern != '<local>' and (fnmatch.fnmatchcase(host, pattern) or fnmatch.fnmatchcase(authority, pattern)):
            return True
    return False


def _system_proxy_value(target, proxies):
    value = proxies.get(target.scheme)
    if (not value and os.name == 'nt'
            and not any(key.lower() == f'{target.scheme}_proxy' for key in os.environ)):
        try:
            value = urllib.request.getproxies_registry().get(target.scheme)
        except OSError:
            value = None
    return value


def system_proxies(url):
    target = urllib.parse.urlsplit(url)
    proxies = dict(urllib.request.getproxies())
    if (urllib.request.proxy_bypass_environment(target.hostname, proxies)
            or _windows_bypass(target.hostname.lower(), target.netloc.lower())):
        proxies.pop(target.scheme, None)
        return proxies
    value = _system_proxy_value(target, proxies)
    if value:
        proxies[target.scheme] = value
    return proxies


def select_proxy(url):
    target = urllib.parse.urlsplit(url)
    setting = os.environ.get('COMFYUI_RANKING_MEDIA_PROXY', '').strip()
    if setting.lower() in ('off', 'none', '0'):
        return None
    proxies = urllib.request.getproxies()
    if urllib.request.proxy_bypass_environment(target.hostname, proxies):
        return None
    if not setting and _windows_bypass(target.hostname.lower(), target.netloc.lower()):
        return None
    value = setting or _system_proxy_value(target, proxies)
    if not value:
        return None
    try:
        proxy = urllib.parse.urlsplit(value)
    except (ValueError, TypeError):
        if not setting:
            return None
        raise ValueError('Unsupported local media proxy configuration') from None
    host = proxy.hostname
    if host == 'localhost':
        host = '127.0.0.1'
    try:
        address = ipaddress.ip_address(host)
        valid = (proxy.scheme == 'http' and address.is_loopback and proxy.username is None
                 and proxy.password is None and proxy.path in ('', '/') and not proxy.query
                 and not proxy.fragment and proxy.port is not None and 1 <= proxy.port <= 65535)
    except (ValueError, TypeError):
        valid = False
    if not valid:
        if not setting:
            return None
        raise ValueError('Unsupported local media proxy configuration')
    authority = f'[{address}]' if address.version == 6 else str(address)
    return f'http://{authority}:{proxy.port}'


def _parse_dns(body, host, record_type, forbidden):
    try:
        data = json.loads(body.decode('utf-8'))
        if (not isinstance(data, dict) or type(data.get('Status')) is not int or data['Status'] != 0
                or data.get('TC') is not False):
            raise ValueError()
        question = data.get('Question')
        if (not isinstance(question, list) or len(question) != 1 or not isinstance(question[0], dict)
                or question[0].get('name', '').rstrip('.').lower() != host.rstrip('.').lower()
                or type(question[0].get('type')) is not int or question[0]['type'] != record_type):
            raise ValueError()
        answers = data.get('Answer', [])
        if not isinstance(answers, list) or len(answers) > 32:
            raise ValueError()
        addresses = []
        for answer in answers:
            if not isinstance(answer, dict) or type(answer.get('type')) is not int:
                raise ValueError()
            if answer['type'] in (1, 28):
                address = ipaddress.ip_address(answer.get('data'))
                if forbidden(address) or address.version != (4 if answer['type'] == 1 else 6):
                    raise ValueError()
                if answer['type'] == record_type and str(address) not in addresses:
                    addresses.append(str(address))
        return addresses
    except (ValueError, TypeError, AttributeError, UnicodeError, RecursionError):
        raise aiohttp.ClientConnectionError('Invalid public media DNS response') from None


async def _resolve(session, host, proxy, forbidden):
    for record_type in (1, 28):
        async with asyncio.timeout(DNS_TIMEOUT):
            async with session.get(DNS_URL, params={'name': host, 'type': str(record_type)},
                                   headers={'Host': DNS_HOST, 'Accept': 'application/dns-json', 'Accept-Encoding': 'identity'},
                                   server_hostname=DNS_HOST, ssl=True, proxy=proxy,
                                   allow_redirects=False, auto_decompress=False,
                                   timeout=aiohttp.ClientTimeout(total=DNS_TIMEOUT)) as response:
                if response.status != 200 or response.headers.get('Content-Encoding', 'identity').lower() != 'identity':
                    raise aiohttp.ClientConnectionError('Public media DNS unavailable')
                chunks = bytearray()
                while True:
                    chunk = await response.content.read(min(4096, DNS_MAX_BYTES + 1 - len(chunks)))
                    if not chunk:
                        break
                    chunks.extend(chunk)
                    if len(chunks) > DNS_MAX_BYTES:
                        raise aiohttp.ClientConnectionError('Public media DNS response too large')
                addresses = _parse_dns(bytes(chunks), host, record_type, forbidden)
        if addresses:
            return addresses
    raise aiohttp.ClientConnectionError('Public media DNS has no address')


async def get_pinned(session, url, proxy, forbidden, **kwargs):
    target = URL(url)
    host = target.raw_host
    try:
        address = ipaddress.ip_address(host)
    except ValueError:
        addresses = await _resolve(session, host, proxy, forbidden)
        address = ipaddress.ip_address(addresses[0])
    if forbidden(address):
        raise aiohttp.ClientConnectionError('Forbidden media proxy target')
    headers = {key: value for key, value in kwargs.pop('headers', {}).items() if key.lower() != 'host'}
    headers['Host'] = target.raw_authority
    return await session.get(target.with_host(str(address)), headers=headers, proxy=proxy,
                             server_hostname=host if target.scheme == 'https' else None,
                             ssl=True, allow_redirects=False, **kwargs)
