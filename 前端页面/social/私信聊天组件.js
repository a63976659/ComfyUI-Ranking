import { api } from "../core/网络请求API.js";
import { showToast, showConfirm } from "../components/UI交互提示组件.js";

export function openChatModal(currentUser, targetAccount = null) {
    const container = document.createElement("div");
    Object.assign(container.style, { display: "flex", flexDirection: "column", flex: "none", height: "1220px", boxSizing: "border-box", color: "#fff", background: "#1e1e1e", overflow: "hidden" });
    
    const topHeader = document.createElement("div");
    Object.assign(topHeader.style, { padding: "10px 15px", borderBottom: "1px solid #444", display: "flex", alignItems: "center", gap: "10px", background: "#2a2a2a" });
    topHeader.innerHTML = `
        <button id="btn-back-chat" style="background: #333; border: 1px solid #555; color: #fff; padding: 6px 14px; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: bold; display: flex; align-items: center; gap: 6px; box-shadow: 0 2px 4px rgba(0,0,0,0.2); transition: 0.2s;" onmouseover="this.style.background='#4CAF50'; this.style.borderColor='#4CAF50'" onmouseout="this.style.background='#333'; this.style.borderColor='#555'">
    <span style="font-size: 14px;">⬅</span> 返回
</button>
        <span style="font-weight: bold; color: #4CAF50; flex: 1;">💬 社区私信</span>
    `;
    topHeader.querySelector("#btn-back-chat").onclick = () => window.dispatchEvent(new CustomEvent("comfy-route-back"));
    container.appendChild(topHeader);

    const mainArea = document.createElement("div");
    Object.assign(mainArea.style, { display: "flex", flex: "1", overflow: "hidden" });

    const leftPanel = document.createElement("div");
    Object.assign(leftPanel.style, { width: "130px", borderRight: "1px solid #444", overflowY: "auto", padding: "8px", background: "#222" });
    
    const rightPanel = document.createElement("div");
    Object.assign(rightPanel.style, { flex: "1", display: "flex", flexDirection: "column", background: "#1e1e1e" });
    
    const chatHeader = document.createElement("div");
    Object.assign(chatHeader.style, { padding: "12px", borderBottom: "1px solid #444", display: "flex", justifyContent: "space-between", alignItems: "center", background: "#2a2a2a", color: "#4CAF50" });
    
    const chatHistory = document.createElement("div");
    Object.assign(chatHistory.style, { flex: "1", overflowY: "auto", padding: "15px", display: "flex", flexDirection: "column", gap: "10px" });
    
    const chatInputArea = document.createElement("div");
    Object.assign(chatInputArea.style, { padding: "10px", borderTop: "1px solid #444", display: "none", gap: "10px", background: "#2a2a2a" });
    
    const inputField = document.createElement("input");
    Object.assign(inputField.style, { flex: "1", padding: "10px", borderRadius: "20px", border: "1px solid #555", background: "#333", color: "#fff", outline: "none" });
    inputField.placeholder = "发送私信...";
    
    const sendBtn = document.createElement("button");
    sendBtn.innerText = "发送";
    Object.assign(sendBtn.style, { padding: "8px 18px", background: "#2196F3", color: "#fff", border: "none", borderRadius: "20px", cursor: "pointer", fontWeight: "bold" });
    
    chatInputArea.appendChild(inputField); chatInputArea.appendChild(sendBtn);
    rightPanel.appendChild(chatHeader); rightPanel.appendChild(chatHistory); rightPanel.appendChild(chatInputArea);
    mainArea.appendChild(leftPanel); mainArea.appendChild(rightPanel);
    container.appendChild(mainArea);
    
    let currentChatTarget = targetAccount;
    
    async function loadChatList() {
        leftPanel.innerHTML = "<div style='color:#888; text-align:center; margin-top:20px; font-size:12px;'>加载中...</div>";
        try {
            const res = await api.getChatList(currentUser.account);
            let list = res.data || [];
            
            if (targetAccount && !list.find(c => c.target_account === targetAccount)) {
                list.unshift({ target_account: targetAccount, target_name: targetAccount, last_message: "发起新对话...", unread: 0 });
            }
            
            leftPanel.innerHTML = "";
            if (list.length === 0) { leftPanel.innerHTML = "<div style='color:#888; text-align:center; margin-top:20px; font-size:12px;'>暂无对话记录</div>"; return; }
            
            list.forEach(c => {
                const item = document.createElement("div");
                Object.assign(item.style, { padding: "8px", borderRadius: "6px", cursor: "pointer", marginBottom: "8px", background: currentChatTarget === c.target_account ? "#444" : "#2a2a2a", border: "1px solid #333" });
                item.innerHTML = `
                    <div style="font-weight:bold; font-size:12px; margin-bottom:4px; color:#eee;">@${c.target_name} ${c.unread ? `<span style="background:#F44336; color:white; font-size:10px; padding:2px 6px; border-radius:10px; float:right;">${c.unread}</span>` : ""}</div>
                    <div style="font-size:11px; color:#888; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${c.last_message}</div>
                `;
                item.onclick = () => {
                    currentChatTarget = c.target_account;
                    loadChatList(); 
                    loadChatHistory(c.target_account, c.target_name);
                };
                leftPanel.appendChild(item);
            });
        } catch(e) { leftPanel.innerHTML = "<div style='color:#F44336; font-size:12px; text-align:center;'>加载失败</div>"; }
    }
    
    async function loadChatHistory(targetAcc, targetName) {
        chatHeader.innerHTML = `<span style="font-weight:bold; color:#4CAF50; font-size:13px;">与 @${targetName} 的对话</span>
                                <button id="btn-clear-chat" style="background:transparent; border:1px solid #555; color:#aaa; padding:4px 8px; border-radius:4px; font-size:11px; cursor:pointer;">🗑️ 清空本地</button>`;
        chatInputArea.style.display = "flex";

        const cacheKey = `LocalChats_${currentUser.account}_${targetAcc}`;
        const clearKey = `ClearedChatsAt_${currentUser.account}_${targetAcc}`;
        const clearTime = parseInt(localStorage.getItem(clearKey) || "0");

        let localChats = JSON.parse(localStorage.getItem(cacheKey) || "[]");

        const renderMsgs = (msgs) => {
            chatHistory.innerHTML = "";
            if (msgs.length === 0) { chatHistory.innerHTML = "<div style='color:#888; text-align:center; margin-top:20px; font-size:12px;'>暂无消息，打个招呼吧！</div>"; return; }
            msgs.forEach(m => {
                const isMe = m.sender === currentUser.account;
                const msgDiv = document.createElement("div");
                Object.assign(msgDiv.style, { maxWidth: "80%", padding: "10px 14px", borderRadius: "8px", alignSelf: isMe ? "flex-end" : "flex-start", background: isMe ? "#4CAF50" : "#333", color: "#fff", fontSize: "13px", lineHeight: "1.4", wordBreak: "break-word" });
                msgDiv.innerText = m.content;
                chatHistory.appendChild(msgDiv);
            });
            chatHistory.scrollTop = chatHistory.scrollHeight;
        };

        renderMsgs(localChats);

        try {
            const res = await api.getChatHistory(currentUser.account, targetAcc);
            const remoteChats = res.data || [];
            
            const map = new Map();
            localChats.forEach(m => map.set(m.id, m));
            remoteChats.forEach(m => {
                if (m.created_at * 1000 > clearTime) map.set(m.id, m);
            });
            
            const merged = Array.from(map.values()).sort((a, b) => a.created_at - b.created_at);
            localStorage.setItem(cacheKey, JSON.stringify(merged));
            renderMsgs(merged);
        } catch(e) {}

        chatHeader.querySelector("#btn-clear-chat").onclick = async () => {
            if (await showConfirm("确定要清空与该用户的本地聊天记录吗？云端历史记录不会再同步下来。")) {
                localStorage.setItem(clearKey, Date.now().toString());
                localStorage.setItem(cacheKey, "[]");
                renderMsgs([]);
                showToast("对话已清空", "success");
            }
        };
    }
    
    sendBtn.onclick = async () => {
        const txt = inputField.value.trim();
        if (!txt || !currentChatTarget) return;
        sendBtn.disabled = true; sendBtn.innerText = "⏳";
        try {
            await api.sendPrivateMessage(currentUser.account, currentChatTarget, txt);
            inputField.value = "";
            loadChatHistory(currentChatTarget, currentChatTarget); 
            loadChatList(); 
        } catch(e) { showToast("发送失败: " + e.message, "error"); }
        sendBtn.disabled = false; sendBtn.innerText = "发送";
    };
    
    loadChatList();
    if (targetAccount) loadChatHistory(targetAccount, targetAccount);
    else chatHeader.innerHTML = "<span style='font-size:12px;'>选择左侧联系人开始聊天</span>";
    
    window.dispatchEvent(new CustomEvent("comfy-route-view", { detail: { view: container } }));
}