const AUTHORIZED_USERS = {
    'admin1': 'pass123',
    'admin2': 'pass456'
};

const ADMIN_CREDENTIALS = {
    'superadmin': 'admin@123'
};

let peer, conn, currentUser, typingTimeout, isAdmin = false;
const messages = document.getElementById('messages');
const status = document.getElementById('status');
const typing = document.getElementById('typing');

function getStorageKey() {
    return 'sharedMedia_' + currentUser;
}

function saveToStorage(data) {
    const stored = JSON.parse(localStorage.getItem(getStorageKey()) || '[]');
    stored.push(data);
    localStorage.setItem(getStorageKey(), JSON.stringify(stored));
}

function loadFromStorage() {
    const stored = JSON.parse(localStorage.getItem(getStorageKey()) || '[]');
    stored.forEach(data => addMessage(data, data.sender === currentUser ? 'sent' : 'received'));
}

document.getElementById('loginBtn').addEventListener('click', () => {
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;
    
    if (ADMIN_CREDENTIALS[username] && ADMIN_CREDENTIALS[username] === password) {
        currentUser = username;
        isAdmin = true;
        document.getElementById('loginScreen').style.display = 'none';
        document.getElementById('adminPanel').style.display = 'block';
        loadAdminData();
    } else if (AUTHORIZED_USERS[username] && AUTHORIZED_USERS[username] === password) {
        currentUser = username;
        document.getElementById('loginScreen').style.display = 'none';
        document.getElementById('mainApp').style.display = 'block';
        document.getElementById('userLabel').textContent = '(' + username + ')';
        autoConnectAdmins();
        loadFromStorage();
    } else {
        document.getElementById('loginError').textContent = 'Invalid credentials';
    }
});

function autoConnectAdmins() {
    const roomId = 'admin-room-' + [Object.keys(AUTHORIZED_USERS).sort().join('-')];
    document.getElementById('roomId').value = roomId;
    
    if (!peer) {
        peer = new Peer(currentUser + '-' + Date.now());
        peer.on('open', () => {
            status.textContent = 'Connecting...';
            connectToPeer(roomId);
            setTimeout(() => {
                peer.on('connection', handleConnection);
            }, 1000);
        });
        peer.on('error', (err) => {
            if (err.type === 'unavailable-id') {
                connectToPeer(roomId);
            }
        });
    }
}

document.getElementById('joinBtn').addEventListener('click', () => {
    const roomId = document.getElementById('roomId').value.trim();
    if (!roomId) return alert('Enter a Room ID');
    
    if (!peer) {
        peer = new Peer(roomId);
        peer.on('open', () => {
            status.textContent = 'Waiting...';
            status.className = '';
        });
        peer.on('connection', handleConnection);
        peer.on('error', () => {
            const otherId = prompt('Room taken. Enter friend\'s Room ID:');
            if (otherId) connectToPeer(otherId);
        });
    }
});

function connectToPeer(id) {
    const existingPeers = JSON.parse(localStorage.getItem('activePeers') || '[]');
    existingPeers.forEach(peerId => {
        if (peerId !== peer.id) {
            const connection = peer.connect(peerId);
            if (connection) handleConnection(connection);
        }
    });
    
    const peers = JSON.parse(localStorage.getItem('activePeers') || '[]');
    if (!peers.includes(peer.id)) {
        peers.push(peer.id);
        localStorage.setItem('activePeers', JSON.stringify(peers));
    }
}

function handleConnection(connection) {
    conn = connection;
    status.textContent = 'Connected to ' + (conn.peer.split('-')[0] || 'friend');
    status.className = 'connected';
    
    conn.send({ type: 'online', user: currentUser });
    
    const localData = JSON.parse(localStorage.getItem(getStorageKey()) || '[]');
    conn.send({ type: 'sync', data: localData });
    
    conn.on('data', data => {
        if (data.type === 'typing') {
            typing.style.display = 'inline';
            clearTimeout(typingTimeout);
            typingTimeout = setTimeout(() => typing.style.display = 'none', 2000);
        } else if (data.type === 'online') {
            console.log(data.user + ' is online');
        } else if (data.type === 'sync') {
            mergeStorageData(data.data);
        } else {
            data.sender = data.sender || 'friend';
            addMessage(data, 'received');
            if (data.type === 'image' || data.type === 'video' || data.type === 'text') saveToStorage(data);
            if (conn) conn.send({ type: 'delivered', id: data.id });
        }
    });
    
    conn.on('close', () => {
        status.textContent = 'Disconnected';
        status.className = 'disconnected';
        typing.style.display = 'none';
        const peers = JSON.parse(localStorage.getItem('activePeers') || '[]');
        const filtered = peers.filter(p => p !== conn.peer);
        localStorage.setItem('activePeers', JSON.stringify(filtered));
    });
}

function mergeStorageData(remoteData) {
    const localData = JSON.parse(localStorage.getItem(getStorageKey()) || '[]');
    const merged = [...localData];
    const existingIds = new Set(localData.map(d => d.id));
    
    remoteData.forEach(item => {
        if (!existingIds.has(item.id)) {
            merged.push(item);
        }
    });
    
    merged.sort((a, b) => new Date(a.time) - new Date(b.time));
    localStorage.setItem(getStorageKey(), JSON.stringify(merged));
    messages.innerHTML = '';
    merged.forEach(data => addMessage(data, data.sender === currentUser ? 'sent' : 'received'));
}

document.getElementById('textInput').addEventListener('input', () => {
    if (conn) conn.send({ type: 'typing' });
});

document.getElementById('sendText').addEventListener('click', () => {
    const text = document.getElementById('textInput').value.trim();
    if (!text || !conn) return;
    
    const data = { type: 'text', content: text, id: Date.now(), time: new Date().toISOString(), sender: currentUser };
    conn.send(data);
    addMessage(data, 'sent');
    saveToStorage(data);
    document.getElementById('textInput').value = '';
});

document.getElementById('sendImage').addEventListener('click', () => {
    const file = document.getElementById('imageInput').files[0];
    if (!file || !conn) return;
    
    const reader = new FileReader();
    reader.onload = e => {
        const data = { type: 'image', content: e.target.result, id: Date.now(), time: new Date().toISOString(), sender: currentUser };
        conn.send(data);
        addMessage(data, 'sent');
        saveToStorage(data);
    };
    reader.readAsDataURL(file);
});

document.getElementById('sendVideo').addEventListener('click', () => {
    const file = document.getElementById('videoInput').files[0];
    if (!file || !conn) return;
    
    const reader = new FileReader();
    reader.onload = e => {
        const data = { type: 'video', content: e.target.result, id: Date.now(), time: new Date().toISOString(), sender: currentUser };
        conn.send(data);
        addMessage(data, 'sent');
        saveToStorage(data);
    };
    reader.readAsDataURL(file);
});

function addMessage(data, direction) {
    const div = document.createElement('div');
    div.className = `message ${direction}`;
    
    if (data.type === 'text') {
        div.textContent = data.content;
    } else if (data.type === 'image') {
        const img = document.createElement('img');
        img.src = data.content;
        div.appendChild(img);
    } else if (data.type === 'video') {
        const video = document.createElement('video');
        video.src = data.content;
        video.controls = true;
        div.appendChild(video);
    }
    
    const time = document.createElement('div');
    time.className = 'timestamp';
    time.textContent = data.time ? new Date(data.time).toLocaleTimeString() : new Date().toLocaleTimeString();
    div.appendChild(time);
    
    messages.appendChild(div);
    messages.scrollTop = messages.scrollHeight;
}

document.getElementById('clearBtn').addEventListener('click', () => {
    if (confirm('Clear all messages?')) {
        messages.innerHTML = '';
        localStorage.removeItem(getStorageKey());
    }
});

document.getElementById('exportBtn').addEventListener('click', () => {
    const data = localStorage.getItem(getStorageKey()) || '[]';
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = currentUser + '_data_' + Date.now() + '.json';
    a.click();
    URL.revokeObjectURL(url);
});

document.getElementById('importBtn').addEventListener('click', () => {
    document.getElementById('importFile').click();
});

document.getElementById('importFile').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (event) => {
        try {
            const importedData = JSON.parse(event.target.result);
            const existing = JSON.parse(localStorage.getItem(getStorageKey()) || '[]');
            const merged = [...existing];
            const existingIds = new Set(existing.map(d => d.id));
            
            importedData.forEach(item => {
                if (!existingIds.has(item.id)) {
                    merged.push(item);
                }
            });
            
            localStorage.setItem(getStorageKey(), JSON.stringify(merged));
            messages.innerHTML = '';
            loadFromStorage();
            alert('Data imported successfully!');
        } catch (err) {
            alert('Invalid data file');
        }
    };
    reader.readAsText(file);
});

document.getElementById('logoutBtn').addEventListener('click', () => {
    if (conn) conn.close();
    if (peer) {
        const peers = JSON.parse(localStorage.getItem('activePeers') || '[]');
        const filtered = peers.filter(p => p !== peer.id);
        localStorage.setItem('activePeers', JSON.stringify(filtered));
        peer.destroy();
    }
    peer = null;
    conn = null;
    document.getElementById('mainApp').style.display = 'none';
    document.getElementById('loginScreen').style.display = 'block';
    document.getElementById('username').value = '';
    document.getElementById('password').value = '';
    document.getElementById('loginError').textContent = '';
    status.textContent = 'Disconnected';
    status.className = 'disconnected';
});

function loadAdminData() {
    const admin1Data = JSON.parse(localStorage.getItem('sharedMedia_admin1') || '[]');
    const admin2Data = JSON.parse(localStorage.getItem('sharedMedia_admin2') || '[]');
    const allData = [...admin1Data, ...admin2Data];
    document.getElementById('totalMessages').textContent = allData.length;
    document.getElementById('activeUsers').textContent = Object.keys(AUTHORIZED_USERS).length;
}

document.getElementById('viewAllBtn').addEventListener('click', () => {
    const admin1Data = JSON.parse(localStorage.getItem('sharedMedia_admin1') || '[]');
    const admin2Data = JSON.parse(localStorage.getItem('sharedMedia_admin2') || '[]');
    const stored = [...admin1Data, ...admin2Data].sort((a, b) => new Date(a.time) - new Date(b.time));
    const adminMessages = document.getElementById('adminMessages');
    adminMessages.innerHTML = '<h3>All Shared Media</h3>';
    stored.forEach(data => {
        const div = document.createElement('div');
        div.className = 'message';
        div.innerHTML = `<strong>${data.sender}</strong> - ${data.type} - ${new Date(data.time).toLocaleString()}`;
        adminMessages.appendChild(div);
    });
});

document.getElementById('adminLogoutBtn').addEventListener('click', () => {
    document.getElementById('adminPanel').style.display = 'none';
    document.getElementById('loginScreen').style.display = 'block';
    document.getElementById('username').value = '';
    document.getElementById('password').value = '';
    document.getElementById('loginError').textContent = '';
    isAdmin = false;
});
