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
        <span style="font-size: 16px; font-weight: bold;">💬 私信聊天</span>
    `;
    topHeader.querySelector("#btn-back-chat").onclick = () => window.dispatchEvent(new CustomEvent("comfy-route-back"));
    container.appendChild(topHeader);

    const mainArea = document.createElement("div");
    Object.assign(mainArea.style, { display: "flex", flex: 1, overflow: "hidden" });
    
    const leftPanel = document.createElement("div");
    Object.assign(leftPanel.style, { width: "250px", borderRight: "1px solid #444", display: "flex", flexDirection: "column", background: "#181818" });
    const chatListContainer = document.createElement("div");
    Object.assign(chatListContainer.style, { flex: 1, overflowY: "auto" });
    leftPanel.appendChild(chatListContainer);
    
    const rightPanel = document.createElement("div");
    Object.assign(rightPanel.style, { flex: 1, display: "flex", flexDirection: "column", background: "#1e1e1e" });
    
    const chatHeader = document.createElement("div");
    Object.assign(chatHeader.style, { padding: "15px", borderBottom: "1px solid #333", background: "#222", fontWeight: "bold", display: "flex", alignItems: "center" });
    
    const messagesArea = document.createElement("div");
    Object.assign(messagesArea.style, { flex: 1, padding: "15px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "10px" });
    
    const inputArea = document.createElement("div");
    Object.assign(inputArea.style, { padding: "15px", borderTop: "1px solid #333", display: "flex", gap: "10px", background: "#222" });
    
    const inputField = document.createElement("input");
    Object.assign(inputField.style, { flex: 1, padding: "10px", borderRadius: "20px", border: "1px solid #555", background: "#333", color: "#fff", outline: "none" });
    inputField.placeholder = "输入消息...";
    
    const sendBtn = document.createElement("button");
    Object.assign(sendBtn.style, { padding: "10px 20px", borderRadius: "20px", border: "none", background: "#2196F3", color: "#fff", cursor: "pointer", fontWeight: "bold" });
    sendBtn.innerText = "发送";
    
    inputArea.appendChild(inputField);
    inputArea.appendChild(sendBtn);
    
    rightPanel.appendChild(chatHeader);
    rightPanel.appendChild(messagesArea);
    rightPanel.appendChild(inputArea);
    
    mainArea.appendChild(leftPanel);
    mainArea.appendChild(rightPanel);
    container.appendChild(mainArea);

    let currentChatTarget = null;
    let autoRefreshTimer = null;

    const loadChatList = async () => {
        try {
            const res = await api.getChatList(currentUser.account);
            const list = res.data || [];
            chatListContainer.innerHTML = "";
            if (list.length === 0) {
                chatListContainer.innerHTML = `<div style="padding:20px; text-align:center; color:#888; font-size:12px;">暂无对话</div>`;
                return;
            }
            list.forEach(chat => {
                // 🚀 核心修复：兼容各种可能的后端键名映射
                const acc = chat.target_account || chat.account || chat.receiver || chat.sender;
                const name = chat.target_name || chat.name || acc;

                const chatItem = document.createElement("div");
                Object.assign(chatItem.style, { padding: "10px", borderBottom: "1px solid #333", cursor: "pointer", transition: "0.2s" });
                chatItem.onmouseover = () => chatItem.style.background = "#2a2a2a";
                chatItem.onmouseout = () => chatItem.style.background = "transparent";
                
                chatItem.innerHTML = `<div style="font-weight:bold;">${name}</div><div style="font-size:12px; color:#aaa;">@${acc}</div>`;
                // 确保传入正确的两个参数
                chatItem.onclick = () => loadChatHistory(acc, name);
                chatListContainer.appendChild(chatItem);
            });
        } catch(e) {}
    };

    const renderMsgs = (msgs) => {
        messagesArea.innerHTML = "";
        msgs.forEach(msg => {
            const isMe = msg.sender === currentUser.account;
            const bubbleWrap = document.createElement("div");
            Object.assign(bubbleWrap.style, { display: "flex", justifyContent: isMe ? "flex-end" : "flex-start" });
            
            const bubble = document.createElement("div");
            Object.assign(bubble.style, { maxWidth: "70%", padding: "10px 15px", borderRadius: "12px", fontSize: "14px", lineHeight: "1.5", wordBreak: "break-word" });
            if (isMe) {
                Object.assign(bubble.style, { background: "#2196F3", color: "#fff", borderBottomRightRadius: "2px" });
            } else {
                Object.assign(bubble.style, { background: "#444", color: "#eee", borderBottomLeftRadius: "2px" });
            }
            bubble.innerText = msg.content;
            bubbleWrap.appendChild(bubble);
            messagesArea.appendChild(bubbleWrap);
        });
        setTimeout(() => messagesArea.scrollTop = messagesArea.scrollHeight, 50);
    };

    const loadChatHistory = async (targetAccount, targetName) => {
        // 🚀 核心修复：防止 undefined 污染数据流
        if (!targetAccount || targetAccount === "undefined") return; 

        currentChatTarget = targetAccount;
        // 智能回退：如果没有名字，就用账号代替
        const displayName = targetName && targetName !== "undefined" ? targetName : targetAccount;

        chatHeader.innerHTML = `
            <button id="btn-back-chat-list" style="background: transparent; border: 1px solid #555; color: #aaa; padding: 4px 10px; border-radius: 4px; cursor: pointer; font-size: 12px; margin-right: 10px;">⬅ 返回列表</button>
            <span>与 <b>${displayName}</b> (@${targetAccount}) 的对话</span>
            <button id="btn-clear-chat" style="margin-left: auto; background: transparent; border: 1px solid #F44336; color: #F44336; padding: 4px 10px; border-radius: 4px; cursor: pointer; font-size: 12px;">清空本地</button>
        `;
        
        chatHeader.querySelector("#btn-back-chat-list").onclick = () => {
            currentChatTarget = null;
            chatHeader.innerHTML = "<span>👈 请在左侧选择对话</span>";
            messagesArea.innerHTML = "";
        };

        const cacheKey = `ComfyCommunity_ChatHistory_${currentUser.account}_${targetAccount}`;
        const clearKey = `ComfyCommunity_ChatCleared_${currentUser.account}_${targetAccount}`;
        
        const cachedStr = localStorage.getItem(cacheKey);
        if (cachedStr) { try { renderMsgs(JSON.parse(cachedStr)); } catch(e){} }
        
        try {
            const res = await api.getChatHistory(currentUser.account, targetAccount);
            const cloudMsgs = res.data || [];
            
            const clearTimeStr = localStorage.getItem(clearKey);
            const clearTime = clearTimeStr ? parseInt(clearTimeStr) : 0;
            
            let localMsgs = [];
            if (cachedStr) { try { localMsgs = JSON.parse(cachedStr); } catch(e){} }
            
            const map = new Map();
            localMsgs.forEach(m => {
                if (!m.id) m.id = "local_" + Math.random();
                map.set(m.id, m);
            });
            cloudMsgs.forEach(m => {
                const mTime = m.created_at ? (m.created_at * 1000) : 0;
                if (mTime > clearTime) { map.set(m.id, m); }
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
    
    container.addEventListener("DOMNodeRemovedFromDocument", () => {
        if (autoRefreshTimer) clearInterval(autoRefreshTimer);
    });

    window.dispatchEvent(new CustomEvent("comfy-route-view", { detail: { view: container } }));
}