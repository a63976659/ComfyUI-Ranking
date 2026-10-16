export async function readLocalJSON(response, controller, maxBytes) {
    const declared = response.headers.get('Content-Length');
    if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > maxBytes)) {
        throw new Error('local_response_invalid');
    }
    const reader = response.body?.getReader();
    if (!reader) throw new Error('local_response_invalid');
    const chunks = [];
    let size = 0, complete = false;
    try {
        while (true) {
            const chunk = await reader.read();
            if (chunk.done) { complete = true; break; }
            if (!chunk.value.byteLength) continue;
            size += chunk.value.byteLength;
            if (size > maxBytes) throw new Error('local_response_invalid');
            chunks.push(chunk.value);
        }
        const body = new Uint8Array(size);
        let offset = 0;
        for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
        return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body));
    } finally {
        if (!complete) {
            controller.abort();
            try { await reader.cancel(); } catch {}
        }
        reader.releaseLock();
    }
}
