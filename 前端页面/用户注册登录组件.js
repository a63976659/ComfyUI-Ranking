// 前端页面/用户注册登录组件.js
import { globalModal } from "./全局弹窗管理器.js";

export function createAuthForm(onSuccessCallback) {
    const container = document.createElement("div");
    Object.assign(container.style, {
        display: "flex", flexDirection: "column", gap: "15px", color: "#ccc", fontSize: "14px"
    });

    const DEFAULT_AVATAR_MALE = "https://via.placeholder.com/150/2196F3/FFFFFF?text=Male";
    const DEFAULT_AVATAR_FEMALE = "https://via.placeholder.com/150/E91E63/FFFFFF?text=Female";

    // 【新增阶段一】：升级为状态机以支持第三种状态
    let viewState = "login"; // "login" | "register" | "reset"

    function render() {
        container.innerHTML = ""; 

        if (viewState === "login") {
            container.innerHTML = `
                <div style="margin-bottom: 10px;">
                    <label style="display: block; margin-bottom: 5px;">登录账号 (或邮箱/手机号) <span style="color: #F44336;">*</span></label>
                    <input type="text" id="login-account" style="width: 100%; padding: 8px; background: #333; border: 1px solid #555; color: #fff; border-radius: 4px; box-sizing: border-box;">
                </div>
                <div style="margin-bottom: 15px;">
                    <label style="display: block; margin-bottom: 5px;">密码 <span style="color: #F44336;">*</span></label>
                    <input type="password" id="login-password" style="width: 100%; padding: 8px; background: #333; border: 1px solid #555; color: #fff; border-radius: 4px; box-sizing: border-box;">
                </div>
                <div style="margin-bottom: 20px; display: flex; align-items: center; gap: 8px;">
                    <input type="checkbox" id="login-remember" checked style="cursor: pointer;">
                    <label for="login-remember" style="font-size: 12px; color: #aaa; cursor: pointer;">保持登录 30 天</label>
                </div>
                <button id="btn-submit-login" style="width: 100%; padding: 10px; background: #4CAF50; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: bold; margin-bottom: 10px;">登 录</button>
                <div style="text-align: center; font-size: 12px; display: flex; justify-content: space-between;">
                    <a href="#" id="toggle-to-reset" style="color: #aaa; text-decoration: none;">修改/找回密码？</a>
                    <span>没有账号？ <a href="#" id="toggle-to-register" style="color: #4CAF50; text-decoration: none;">立即注册</a></span>
                </div>
            `;

            container.querySelector("#toggle-to-register").onclick = (e) => { e.preventDefault(); viewState = "register"; render(); };
            container.querySelector("#toggle-to-reset").onclick = (e) => { e.preventDefault(); viewState = "reset"; render(); };

            container.querySelector("#btn-submit-login").onclick = () => {
                const account = container.querySelector("#login-account").value.trim();
                const password = container.querySelector("#login-password").value;
                const remember = container.querySelector("#login-remember").checked;
                if (!account || !password) return alert("账号和密码不能为空！");
                if (onSuccessCallback) onSuccessCallback({ type: "login", account, password, remember });
            };

        } else if (viewState === "reset") {
            // 【新增阶段一】：修改密码视图
            container.innerHTML = `
                <div style="margin-bottom: 10px;">
                    <label style="display: block; margin-bottom: 5px;">当前账号 <span style="color: #F44336;">*</span></label>
                    <input type="text" id="reset-account" style="width: 100%; padding: 8px; background: #333; border: 1px solid #555; color: #fff; border-radius: 4px; box-sizing: border-box;">
                </div>
                <div style="margin-bottom: 10px;">
                    <label style="display: block; margin-bottom: 5px;">原密码 <span style="color: #F44336;">*</span></label>
                    <input type="password" id="reset-old-password" style="width: 100%; padding: 8px; background: #333; border: 1px solid #555; color: #fff; border-radius: 4px; box-sizing: border-box;">
                </div>
                <div style="margin-bottom: 10px;">
                    <label style="display: block; margin-bottom: 5px;">新密码 <span style="color: #F44336;">*</span></label>
                    <input type="password" id="reset-new-password" style="width: 100%; padding: 8px; background: #333; border: 1px solid #555; color: #fff; border-radius: 4px; box-sizing: border-box;">
                </div>
                <div style="margin-bottom: 20px;">
                    <label style="display: block; margin-bottom: 5px;">确认新密码 <span style="color: #F44336;">*</span></label>
                    <input type="password" id="reset-confirm-password" style="width: 100%; padding: 8px; background: #333; border: 1px solid #555; color: #fff; border-radius: 4px; box-sizing: border-box;">
                </div>
                <button id="btn-submit-reset" style="width: 100%; padding: 10px; background: #FF9800; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: bold; margin-bottom: 10px;">修 改 密 码</button>
                <div style="text-align: center; font-size: 12px;"><a href="#" id="toggle-to-login" style="color: #2196F3; text-decoration: none;">返回登录</a></div>
            `;
            
            container.querySelector("#toggle-to-login").onclick = (e) => { e.preventDefault(); viewState = "login"; render(); };
            
            container.querySelector("#btn-submit-reset").onclick = () => {
                const account = container.querySelector("#reset-account").value.trim();
                const oldPassword = container.querySelector("#reset-old-password").value;
                const newPassword = container.querySelector("#reset-new-password").value;
                const confirmPwd = container.querySelector("#reset-confirm-password").value;
                
                if(!account || !oldPassword || !newPassword) return alert("请完整填写表单！");
                if(newPassword !== confirmPwd) return alert("两次输入的新密码不一致！");
                if(newPassword.length < 6) return alert("新密码至少需要 6 位");
                
                if (onSuccessCallback) onSuccessCallback({ type: "reset", account, oldPassword, newPassword });
            };

        } else if (viewState === "register") {
            container.innerHTML = `
                <div style="display: flex; gap: 10px; margin-bottom: 10px;">
                    <div style="flex: 1;"><label style="display: block; margin-bottom: 5px;">账号 <span style="color: #F44336;">*</span></label><input type="text" id="reg-account" required style="width: 100%; padding: 8px; background: #333; border: 1px solid #555; color: #fff; border-radius: 4px; box-sizing: border-box;"></div>
                    <div style="flex: 1;"><label style="display: block; margin-bottom: 5px;">显示名称 <span style="color: #F44336;">*</span></label><input type="text" id="reg-name" required style="width: 100%; padding: 8px; background: #333; border: 1px solid #555; color: #fff; border-radius: 4px; box-sizing: border-box;"></div>
                </div>
                <div style="display: flex; gap: 10px; margin-bottom: 10px;">
                    <div style="flex: 1;"><label style="display: block; margin-bottom: 5px;">密码 <span style="color: #F44336;">*</span></label><input type="password" id="reg-password" required style="width: 100%; padding: 8px; background: #333; border: 1px solid #555; color: #fff; border-radius: 4px; box-sizing: border-box;"></div>
                    <div style="flex: 1;"><label style="display: block; margin-bottom: 5px;">确认密码 <span style="color: #F44336;">*</span></label><input type="password" id="reg-password-confirm" required style="width: 100%; padding: 8px; background: #333; border: 1px solid #555; color: #fff; border-radius: 4px; box-sizing: border-box;"></div>
                </div>
                <div style="display: flex; gap: 10px; margin-bottom: 10px;">
                    <div style="flex: 1;"><label style="display: block; margin-bottom: 5px;">安全邮箱 <span style="color: #F44336;">*</span></label><input type="email" id="reg-email" required style="width: 100%; padding: 8px; background: #333; border: 1px solid #555; color: #fff; border-radius: 4px; box-sizing: border-box;"></div>
                    <div style="flex: 1;"><label style="display: block; margin-bottom: 5px;">手机号码 <span style="color: #F44336;">*</span></label><input type="tel" id="reg-phone" required style="width: 100%; padding: 8px; background: #333; border: 1px solid #555; color: #fff; border-radius: 4px; box-sizing: border-box;"></div>
                </div>
                <div style="margin-bottom: 10px; background: #2a2a2a; padding: 10px; border-radius: 4px; border: 1px dashed #555; display: flex; align-items: center; justify-content: space-between;">
                    <div>
                        <label style="display: block; margin-bottom: 5px;">自定义头像 (可选)</label>
                        <div style="display: flex; align-items: center; gap: 10px;">
                            <img id="avatar-preview" src="${DEFAULT_AVATAR_MALE}" style="width: 40px; height: 40px; border-radius: 50%; object-fit: cover; border: 2px solid #444;">
                            <input type="file" id="reg-avatar" accept="image/*" style="font-size: 12px; color: #aaa; max-width: 150px;">
                        </div>
                        <div id="avatar-error" style="color: #F44336; font-size: 12px; margin-top: 5px; display: none;">文件超出 3MB！</div>
                    </div>
                    <div>
                        <label style="display: block; margin-bottom: 5px;">性别 <span style="color: #F44336;">*</span></label>
                        <select id="reg-gender" style="width: 100%; padding: 8px; background: #333; border: 1px solid #555; color: #fff; border-radius: 4px;">
                            <option value="male">男</option><option value="female">女</option>
                        </select>
                    </div>
                </div>
                <div style="display: flex; gap: 10px; margin-bottom: 10px;">
                    <div style="flex: 1;"><label style="display: block; margin-bottom: 5px;">年龄</label><input type="number" id="reg-age" style="width: 100%; padding: 8px; background: #333; border: 1px solid #555; color: #fff; border-radius: 4px;"></div>
                    <div style="flex: 1;"><label style="display: block; margin-bottom: 5px;">国家</label><input type="text" id="reg-country" style="width: 100%; padding: 8px; background: #333; border: 1px solid #555; color: #fff; border-radius: 4px;"></div>
                    <div style="flex: 1;"><label style="display: block; margin-bottom: 5px;">地区</label><input type="text" id="reg-region" style="width: 100%; padding: 8px; background: #333; border: 1px solid #555; color: #fff; border-radius: 4px;"></div>
                </div>
                <div style="margin-bottom: 20px;"><label style="display: block; margin-bottom: 5px;">个人介绍</label><textarea id="reg-intro" rows="2" style="width: 100%; padding: 8px; background: #333; border: 1px solid #555; color: #fff; border-radius: 4px; resize: vertical;"></textarea></div>
                <button id="btn-submit-register" style="width: 100%; padding: 10px; background: #2196F3; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: bold; margin-bottom: 10px;">注 册 账 号</button>
                <div style="text-align: center; font-size: 12px;">已有账号？ <a href="#" id="toggle-to-login" style="color: #2196F3; text-decoration: none;">返回登录</a></div>
            `;

            const genderSelect = container.querySelector("#reg-gender");
            const avatarPreview = container.querySelector("#avatar-preview");
            const avatarInput = container.querySelector("#reg-avatar");
            const avatarError = container.querySelector("#avatar-error");
            
            let selectedAvatarFile = null;
            genderSelect.onchange = (e) => { if (!selectedAvatarFile) avatarPreview.src = e.target.value === "male" ? DEFAULT_AVATAR_MALE : DEFAULT_AVATAR_FEMALE; };

            avatarInput.onchange = (e) => {
                const file = e.target.files[0];
                if (!file) return;
                if (file.size > 3 * 1024 * 1024) {
                    avatarError.style.display = "block"; avatarInput.value = ""; selectedAvatarFile = null;
                    avatarPreview.src = genderSelect.value === "male" ? DEFAULT_AVATAR_MALE : DEFAULT_AVATAR_FEMALE; return;
                }
                avatarError.style.display = "none";
                selectedAvatarFile = file;
                const reader = new FileReader();
                reader.onload = (event) => avatarPreview.src = event.target.result;
                reader.readAsDataURL(file);
            };

            container.querySelector("#toggle-to-login").onclick = (e) => { e.preventDefault(); viewState = "login"; render(); };

            container.querySelector("#btn-submit-register").onclick = () => {
                const account = container.querySelector("#reg-account").value.trim();
                const name = container.querySelector("#reg-name").value.trim();
                const password = container.querySelector("#reg-password").value;
                const pwdConfirm = container.querySelector("#reg-password-confirm").value;
                const email = container.querySelector("#reg-email").value.trim();
                const phone = container.querySelector("#reg-phone").value.trim();

                if (!account || !name || !password || !email || !phone) return alert("带 * 号的均为必填项！");
                if (!/^[a-zA-Z0-9_]{4,20}$/.test(account)) return alert("账号只能包含英文、数字和下划线，且长度在4-20之间！");
                if (password !== pwdConfirm) return alert("两次输入的密码不一致！");
                if (password.length < 6) return alert("密码长度至少需要6位！");

                const formData = {
                    type: "register", account, password, email, phone, name,
                    gender: genderSelect.value, age: container.querySelector("#reg-age").value,
                    country: container.querySelector("#reg-country").value, region: container.querySelector("#reg-region").value,
                    intro: container.querySelector("#reg-intro").value,
                    avatarFile: selectedAvatarFile, avatarDataUrl: selectedAvatarFile ? avatarPreview.src : null 
                };
                if (onSuccessCallback) onSuccessCallback(formData);
            };
        }
    }
    render();
    return container;
}

export function showAuthModal(onAuthCallback) {
    const formElement = createAuthForm(onAuthCallback);
    globalModal.openModal("社区账号登录 / 注册", formElement, { width: "550px" });
}