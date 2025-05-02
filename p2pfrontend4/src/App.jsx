import React, { useRef, useState } from 'react';

const WS_URL = 'ws://localhost:8000/ws';

function App() {
  const [connectionId, setConnectionId] = useState('');
  const [targetId, setTargetId] = useState('');
  const [log, setLog] = useState([]);
  const [isReceivingFile, setIsReceivingFile] = useState(false);
  const [receivedChunks, setReceivedChunks] = useState(0);
  const [totalChunks, setTotalChunks] = useState(0);
  const [fileName, setFileName] = useState('downloaded_file');
  const [isConnected, setIsConnected] = useState(false);
  const [isRegistered, setIsRegistered] = useState(false);
  const wsRef = useRef(null);
  const fileMetadataRef = useRef(null);
  const fileChunksRef = useRef([]);

  const logMessage = (msg) => {
    setLog((prev) => [...prev, msg]);
  };

  const connectWebSocket = () => {
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
      logMessage('✅ WebSocket connected');
    };

    ws.onmessage = (event) => {
      const data = event.data;
      
      if (typeof data === 'string') {
        try {
          const jsonData = JSON.parse(data);
          logMessage(`📩 Message: ${JSON.stringify(jsonData)}`);
          
          // Check if this is a file transfer start message with metadata
          if (jsonData.type === 'file_start') {
            // Reset file chunks for new transfer
            fileChunksRef.current = [];
            setIsReceivingFile(true);
            setReceivedChunks(0);
            setTotalChunks(jsonData.totalChunks || 0);
            fileMetadataRef.current = {
              name: jsonData.fileName || 'downloaded_file',
              size: jsonData.fileSize || 0,
              totalChunks: jsonData.totalChunks || 0,
              mimeType: jsonData.mimeType || 'application/octet-stream'
            };
            setFileName(jsonData.fileName || 'downloaded_file');
            logMessage(`📥 Starting file transfer: ${fileMetadataRef.current.name} (${(fileMetadataRef.current.size / (1024 * 1024)).toFixed(2)} MB)`);
          } 
          // Check if this is a file transfer end message
          else if (jsonData.type === 'file_end') {
            logMessage(`✅ File transfer complete: ${receivedChunks} chunks received`);
            // Ensure we're using the ref value for chunk count
            assembleFile(fileChunksRef.current);
            setIsReceivingFile(false);
          }
        } catch (e) {
          // Not JSON data, treat as regular message
          logMessage(`📩 Message: ${data}`);
        }
      } else {
        // Binary data - file chunk
        handleFileChunk(data);
      }
    };

    ws.onclose = () => {
      setIsConnected(false);
      setIsRegistered(false);
      logMessage('❌ WebSocket disconnected');
      if (isReceivingFile) {
        logMessage('⚠️ File transfer interrupted');
        setIsReceivingFile(false);
      }
    };

    ws.onerror = (error) => {
      logMessage(`⚠️ WebSocket error: ${error.message || 'Unknown error'}`);
    };
  };

  const handleFileChunk = async (chunk) => {
    try {
      const buffer = await chunk.arrayBuffer();
      // Use the ref to store chunks to avoid state update issues
      fileChunksRef.current.push(buffer);
      // Update the counter
      const newCount = receivedChunks + 1;
      setReceivedChunks(newCount);
      logMessage(`📦 Received file chunk #${newCount}`);
    } catch (error) {
      logMessage(`⚠️ Error processing chunk: ${error.message}`);
    }
  };

  const assembleFile = (chunks) => {
    if (!chunks || chunks.length === 0) {
      logMessage("⚠️ No chunks received to assemble");
      return;
    }
    
    try {
      // Calculate total size
      const totalBytes = chunks.reduce((acc, chunk) => acc + chunk.byteLength, 0);
      
      // Create a new array with the total size
      const completeFile = new Uint8Array(totalBytes);
      
      // Copy each chunk into the complete file array
      let offset = 0;
      chunks.forEach(chunk => {
        completeFile.set(new Uint8Array(chunk), offset);
        offset += chunk.byteLength;
      });
      
      // Create a blob from the complete file
      const mimeType = fileMetadataRef.current?.mimeType || 'application/octet-stream';
      const blob = new Blob([completeFile], { type: mimeType });
      const url = URL.createObjectURL(blob);
      
      // Add download link to log with more prominence
      const downloadLink = `
        <div style="background-color: #e8f4f8; padding: 10px; border-radius: 5px; margin: 10px 0;">
          <strong>🎁 File assembled successfully!</strong><br>
          <a href="${url}" download="${fileName}" style="display: inline-block; background-color: #4caf50; color: white; padding: 8px 16px; text-decoration: none; border-radius: 4px; margin-top: 8px;">
            Download ${fileName} (${(totalBytes / (1024 * 1024)).toFixed(2)} MB)
          </a>
        </div>
      `;
      logMessage(downloadLink);
      
      // Log stats for debugging
      logMessage(`📊 File assembly stats: ${chunks.length} chunks, ${totalBytes} bytes`);
    } catch (error) {
      logMessage(`⚠️ Error assembling file: ${error.message}`);
    }
  };

  const registerId = () => {
    if (!wsRef.current || !connectionId) {
      logMessage("⚠️ Please enter an ID and connect to server first");
      return;
    }
  
    // Important: Match the exact format expected by the backend
    const payload = {
      type: " register",  // Note: The backend expects a space before "register"
      connectionsId: connectionId
    };
  
    try {
      wsRef.current.send(JSON.stringify(payload));
      setIsRegistered(true);
      logMessage(`🔐 Registered as: ${connectionId}`);
    } catch (error) {
      logMessage(`⚠️ Registration error: ${error.message}`);
    }
  };

  const connectToPeer = () => {
    if (!wsRef.current || !targetId || !isRegistered) {
      logMessage("⚠️ Please connect to server, register your ID, and specify a target ID");
      return;
    }

    const payload = {
      target_id: targetId,
      message: 'Start transfer'
    };
    
    try {
      wsRef.current.send(JSON.stringify(payload));
      logMessage(`🔗 Connecting to: ${targetId}`);
    } catch (error) {
      logMessage(`⚠️ Error connecting to peer: ${error.message}`);
    }
  };

  const sendFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    if (!wsRef.current || !targetId || !isRegistered) {
      logMessage("⚠️ Please select a file, connect to server, register your ID, and specify a target ID");
      return;
    }

    const chunkSize = 64 * 1024; // 64KB chunks
    const totalChunks = Math.ceil(file.size / chunkSize);
    const reader = new FileReader();
    let offset = 0;
    let chunkIndex = 0;

    // Send file metadata first
    const metadataPayload = {
      type: 'file_start',
      target_id: targetId,
      fileName: file.name,
      fileSize: file.size,
      totalChunks: totalChunks,
      mimeType: file.type || 'application/octet-stream'
    };
    
    try {
      wsRef.current.send(JSON.stringify(metadataPayload));
      logMessage(`📤 Starting file transfer: ${file.name} (${(file.size / (1024 * 1024)).toFixed(2)} MB)`);

      const readChunk = () => {
        if (offset >= file.size) {
          // All chunks sent, send end of file marker
          const endPayload = {
            type: 'file_end',
            target_id: targetId,
            fileName: file.name
          };
          wsRef.current.send(JSON.stringify(endPayload));
          logMessage('✅ File sent!');
          return;
        }

        const slice = file.slice(offset, offset + chunkSize);
        reader.readAsArrayBuffer(slice);
      };

      reader.onload = () => {
        const chunk = reader.result;
        
        // Send the binary data directly
        wsRef.current.send(chunk);
        
        offset += chunk.byteLength;
        chunkIndex++;
        
        const progress = Math.min(100, Math.round((offset / file.size) * 100));
        logMessage(`📤 Sent chunk ${chunkIndex}/${totalChunks} (${progress}% complete)`);
        
        // Send next chunk with a small delay to prevent flooding
        setTimeout(readChunk, 10);
      };

      reader.onerror = (error) => {
        logMessage(`⚠️ Error reading file: ${error}`);
      };

      // Start reading the first chunk
      readChunk();
    } catch (error) {
      logMessage(`⚠️ Error sending file: ${error.message}`);
    }
  };

  // CSS styles
  const styles = {
    container: { 
      padding: 20,
      maxWidth: '800px',
      margin: '0 auto',
      fontFamily: 'Arial, sans-serif'
    },
    header: {
      color: '#2c3e50',
      borderBottom: '2px solid #3498db',
      paddingBottom: '10px'
    },
    section: {
      marginTop: 20,
      padding: '15px',
      backgroundColor: '#f8f9fa',
      borderRadius: '5px',
      border: '1px solid #e9ecef'
    },
    input: {
      padding: '8px 12px',
      borderRadius: '4px',
      border: '1px solid #ced4da',
      marginRight: '10px',
      width: '200px'
    },
    button: (disabled) => ({
      padding: '8px 16px',
      backgroundColor: disabled ? '#95a5a6' : '#3498db',
      color: 'white',
      border: 'none',
      borderRadius: '4px',
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.7 : 1
    }),
    fileInput: {
      margin: '10px 0'
    },
    log: {
      maxHeight: 300,
      overflowY: 'scroll',
      border: '1px solid #ced4da',
      padding: 10,
      backgroundColor: '#f8f9fa',
      borderRadius: '4px',
      fontFamily: 'monospace',
      fontSize: '14px'
    },
    transferStatus: {
      padding: '10px',
      marginTop: '15px',
      backgroundColor: '#e8f4f8',
      borderRadius: '4px',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center'
    },
    progressBar: {
      width: '100%',
      height: '20px',
      backgroundColor: '#e0e0e0',
      borderRadius: '10px',
      overflow: 'hidden',
      marginTop: '10px'
    },
    progressFill: (progress) => ({
      height: '100%',
      width: `${progress}%`,
      backgroundColor: '#4caf50',
      transition: 'width 0.3s ease'
    }),
    statusIndicator: (connected) => ({
      width: '12px',
      height: '12px',
      borderRadius: '50%',
      backgroundColor: connected ? '#2ecc71' : '#e74c3c',
      display: 'inline-block',
      marginRight: '8px'
    })
  };

  // Calculate progress percentage
  const calculateProgress = () => {
    if (totalChunks === 0) return 0;
    return Math.min(100, Math.round((receivedChunks / totalChunks) * 100));
  };

  return (
    <div style={styles.container}>
      <h1 style={styles.header}>📁 P2P File Transfer</h1>
      
      <div style={styles.section}>
        <h3>
          <span style={styles.statusIndicator(isConnected)}></span>
          1. Connect to Server
        </h3>
        <button 
          style={styles.button(isConnected)} 
          onClick={connectWebSocket}
          disabled={isConnected}
        >
          {isConnected ? 'Connected' : 'Connect to WebSocket Server'}
        </button>
      </div>

      <div style={styles.section}>
        <h3>
          <span style={styles.statusIndicator(isRegistered)}></span>
          2. Register Your ID
        </h3>
        <input
          style={styles.input}
          placeholder="Your ID"
          value={connectionId}
          onChange={(e) => setConnectionId(e.target.value)}
          disabled={!isConnected || isRegistered}
        />
        <button 
          style={styles.button(!isConnected || !connectionId || isRegistered)} 
          onClick={registerId}
          disabled={!isConnected || !connectionId || isRegistered}
        >
          {isRegistered ? 'Registered' : 'Register'}
        </button>
      </div>

      <div style={styles.section}>
        <h3>3. Connect to Peer</h3>
        <input
          style={styles.input}
          placeholder="Target Peer ID"
          value={targetId}
          onChange={(e) => setTargetId(e.target.value)}
          disabled={!isRegistered}
        />
        <button 
          style={styles.button(!isRegistered || !targetId)} 
          onClick={connectToPeer}
          disabled={!isRegistered || !targetId}
        >
          Connect to Peer
        </button>
      </div>

      <div style={styles.section}>
        <h3>4. Select and Send File</h3>
        <input 
          type="file" 
          onChange={sendFile} 
          style={styles.fileInput}
          disabled={!isRegistered || !targetId} 
        />
      </div>

      {isReceivingFile && (
        <div style={styles.transferStatus}>
          <h3>Receiving File: {fileName}</h3>
          <p>Received {receivedChunks} chunks{totalChunks ? ` of ${totalChunks}` : ''}</p>
          <div style={styles.progressBar}>
            <div style={styles.progressFill(calculateProgress())}></div>
          </div>
        </div>
      )}

      <div style={styles.section}>
        <h3>📜 Log</h3>
        <button 
          style={{...styles.button(false), marginLeft: '10px'}}
          onClick={() => setLog([])}
        >
          Clear Log
        </button>
        <div style={styles.log}>
          {log.map((entry, i) => (
            <div key={i} dangerouslySetInnerHTML={{ __html: entry }} />
          ))}
        </div>
      </div>
    </div>
  );
}

export default App;

/* import React, { useRef, useState } from 'react';

const WS_URL = 'ws://localhost:8000/ws';

function App() {
  const [connectionId, setConnectionId] = useState('');
  const [targetId, setTargetId] = useState('');
  const [log, setLog] = useState([]);
  const [fileChunks, setFileChunks] = useState([]);
  const [isReceivingFile, setIsReceivingFile] = useState(false);
  const [receivedChunks, setReceivedChunks] = useState(0);
  const [totalChunks, setTotalChunks] = useState(0);
  const [fileName, setFileName] = useState('downloaded_file');
  const [isConnected, setIsConnected] = useState(false);
  const [isRegistered, setIsRegistered] = useState(false);
  const wsRef = useRef(null);
  const fileMetadataRef = useRef(null);

  const logMessage = (msg) => {
    setLog((prev) => [...prev, msg]);
  };

  const connectWebSocket = () => {
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
      logMessage('✅ WebSocket connected');
    };

    ws.onmessage = (event) => {
      const data = event.data;
      
      if (typeof data === 'string') {
        try {
          const jsonData = JSON.parse(data);
          logMessage(`📩 Message: ${JSON.stringify(jsonData)}`);
          
          // Check if this is a file transfer start message with metadata
          if (jsonData.type === 'file_start') {
            // Reset file chunks for new transfer
            setFileChunks([]);
            setIsReceivingFile(true);
            setReceivedChunks(0);
            setTotalChunks(jsonData.totalChunks || 0);
            fileMetadataRef.current = {
              name: jsonData.fileName || 'downloaded_file',
              size: jsonData.fileSize || 0,
              totalChunks: jsonData.totalChunks || 0,
              mimeType: jsonData.mimeType || 'application/octet-stream'
            };
            setFileName(jsonData.fileName || 'downloaded_file');
            logMessage(`📥 Starting file transfer: ${fileMetadataRef.current.name} (${(fileMetadataRef.current.size / (1024 * 1024)).toFixed(2)} MB)`);
          } 
          // Check if this is a file transfer end message
          else if (jsonData.type === 'file_end') {
            logMessage(`✅ File transfer complete: ${receivedChunks} chunks received`);
            assembleFile();
            setIsReceivingFile(false);
          }
        } catch (e) {
          // Not JSON data, treat as regular message
          logMessage(`📩 Message: ${data}`);
        }
      } else {
        // Binary data - file chunk
        handleFileChunk(data);
      }
    };

    ws.onclose = () => {
      setIsConnected(false);
      setIsRegistered(false);
      logMessage('❌ WebSocket disconnected');
      if (isReceivingFile) {
        logMessage('⚠️ File transfer interrupted');
        setIsReceivingFile(false);
      }
    };

    ws.onerror = (error) => {
      logMessage(`⚠️ WebSocket error: ${error.message || 'Unknown error'}`);
    };
  };

  const handleFileChunk = async (chunk) => {
    try {
      const buffer = await chunk.arrayBuffer();
      setFileChunks(prev => [...prev, buffer]);
      setReceivedChunks(prev => prev + 1);
      logMessage(`📦 Received file chunk #${receivedChunks + 1}`);
    } catch (error) {
      logMessage(`⚠️ Error processing chunk: ${error.message}`);
    }
  };

  const assembleFile = () => {
    if (fileChunks.length === 0) return;
    
    try {
      // Calculate total size
      const totalBytes = fileChunks.reduce((acc, chunk) => acc + chunk.byteLength, 0);
      
      // Create a new array with the total size
      const completeFile = new Uint8Array(totalBytes);
      
      // Copy each chunk into the complete file array
      let offset = 0;
      fileChunks.forEach(chunk => {
        completeFile.set(new Uint8Array(chunk), offset);
        offset += chunk.byteLength;
      });
      
      // Create a blob from the complete file
      const mimeType = fileMetadataRef.current?.mimeType || 'application/octet-stream';
      const blob = new Blob([completeFile], { type: mimeType });
      const url = URL.createObjectURL(blob);
      
      // Add download link to log
      logMessage(`🎁 File assembly complete! <a href="${url}" download="${fileName}" class="download-link">Download Complete File (${(totalBytes / (1024 * 1024)).toFixed(2)} MB)</a>`);
    } catch (error) {
      logMessage(`⚠️ Error assembling file: ${error.message}`);
    }
  };

  const registerId = () => {
    if (!wsRef.current || !connectionId) {
      logMessage("⚠️ Please enter an ID and connect to server first");
      return;
    }
  
    // Important: Match the exact format expected by the backend
    const payload = {
      type: " register",  // Note: The backend expects a space before "register"
      connectionsId: connectionId
    };
  
    try {
      wsRef.current.send(JSON.stringify(payload));
      setIsRegistered(true);
      logMessage(`🔐 Registered as: ${connectionId}`);
    } catch (error) {
      logMessage(`⚠️ Registration error: ${error.message}`);
    }
  };

  const connectToPeer = () => {
    if (!wsRef.current || !targetId || !isRegistered) {
      logMessage("⚠️ Please connect to server, register your ID, and specify a target ID");
      return;
    }

    const payload = {
      target_id: targetId,
      message: 'Start transfer'
    };
    
    try {
      wsRef.current.send(JSON.stringify(payload));
      logMessage(`🔗 Connecting to: ${targetId}`);
    } catch (error) {
      logMessage(`⚠️ Error connecting to peer: ${error.message}`);
    }
  };

  const sendFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    if (!wsRef.current || !targetId || !isRegistered) {
      logMessage("⚠️ Please select a file, connect to server, register your ID, and specify a target ID");
      return;
    }

    const chunkSize = 64 * 1024; // 64KB chunks
    const totalChunks = Math.ceil(file.size / chunkSize);
    const reader = new FileReader();
    let offset = 0;
    let chunkIndex = 0;

    // Send file metadata first
    const metadataPayload = {
      type: 'file_start',
      target_id: targetId,
      fileName: file.name,
      fileSize: file.size,
      totalChunks: totalChunks,
      mimeType: file.type || 'application/octet-stream'
    };
    
    try {
      wsRef.current.send(JSON.stringify(metadataPayload));
      logMessage(`📤 Starting file transfer: ${file.name} (${(file.size / (1024 * 1024)).toFixed(2)} MB)`);

      const readChunk = () => {
        if (offset >= file.size) {
          // All chunks sent, send end of file marker
          const endPayload = {
            type: 'file_end',
            target_id: targetId,
            fileName: file.name
          };
          wsRef.current.send(JSON.stringify(endPayload));
          logMessage('✅ File sent!');
          return;
        }

        const slice = file.slice(offset, offset + chunkSize);
        reader.readAsArrayBuffer(slice);
      };

      reader.onload = () => {
        const chunk = reader.result;
        
        // Send the binary data directly
        wsRef.current.send(chunk);
        
        offset += chunk.byteLength;
        chunkIndex++;
        
        const progress = Math.min(100, Math.round((offset / file.size) * 100));
        logMessage(`📤 Sent chunk ${chunkIndex}/${totalChunks} (${progress}% complete)`);
        
        // Send next chunk with a small delay to prevent flooding
        setTimeout(readChunk, 10);
      };

      reader.onerror = (error) => {
        logMessage(`⚠️ Error reading file: ${error}`);
      };

      // Start reading the first chunk
      readChunk();
    } catch (error) {
      logMessage(`⚠️ Error sending file: ${error.message}`);
    }
  };

  // CSS styles
  const styles = {
    container: { 
      padding: 20,
      maxWidth: '800px',
      margin: '0 auto',
      fontFamily: 'Arial, sans-serif'
    },
    header: {
      color: '#2c3e50',
      borderBottom: '2px solid #3498db',
      paddingBottom: '10px'
    },
    section: {
      marginTop: 20,
      padding: '15px',
      backgroundColor: '#f8f9fa',
      borderRadius: '5px',
      border: '1px solid #e9ecef'
    },
    input: {
      padding: '8px 12px',
      borderRadius: '4px',
      border: '1px solid #ced4da',
      marginRight: '10px',
      width: '200px'
    },
    button: (disabled) => ({
      padding: '8px 16px',
      backgroundColor: disabled ? '#95a5a6' : '#3498db',
      color: 'white',
      border: 'none',
      borderRadius: '4px',
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.7 : 1
    }),
    fileInput: {
      margin: '10px 0'
    },
    log: {
      maxHeight: 300,
      overflowY: 'scroll',
      border: '1px solid #ced4da',
      padding: 10,
      backgroundColor: '#f8f9fa',
      borderRadius: '4px',
      fontFamily: 'monospace',
      fontSize: '14px'
    },
    transferStatus: {
      padding: '10px',
      marginTop: '15px',
      backgroundColor: '#e8f4f8',
      borderRadius: '4px',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center'
    },
    progressBar: {
      width: '100%',
      height: '20px',
      backgroundColor: '#e0e0e0',
      borderRadius: '10px',
      overflow: 'hidden',
      marginTop: '10px'
    },
    progressFill: (progress) => ({
      height: '100%',
      width: `${progress}%`,
      backgroundColor: '#4caf50',
      transition: 'width 0.3s ease'
    }),
    statusIndicator: (connected) => ({
      width: '12px',
      height: '12px',
      borderRadius: '50%',
      backgroundColor: connected ? '#2ecc71' : '#e74c3c',
      display: 'inline-block',
      marginRight: '8px'
    })
  };

  // Calculate progress percentage
  const calculateProgress = () => {
    if (totalChunks === 0) return 0;
    return Math.min(100, Math.round((receivedChunks / totalChunks) * 100));
  };

  return (
    <div style={styles.container}>
      <h1 style={styles.header}>📁 P2P File Transfer</h1>
      
      <div style={styles.section}>
        <h3>
          <span style={styles.statusIndicator(isConnected)}></span>
          1. Connect to Server
        </h3>
        <button 
          style={styles.button(isConnected)} 
          onClick={connectWebSocket}
          disabled={isConnected}
        >
          {isConnected ? 'Connected' : 'Connect to WebSocket Server'}
        </button>
      </div>

      <div style={styles.section}>
        <h3>
          <span style={styles.statusIndicator(isRegistered)}></span>
          2. Register Your ID
        </h3>
        <input
          style={styles.input}
          placeholder="Your ID"
          value={connectionId}
          onChange={(e) => setConnectionId(e.target.value)}
          disabled={!isConnected || isRegistered}
        />
        <button 
          style={styles.button(!isConnected || !connectionId || isRegistered)} 
          onClick={registerId}
          disabled={!isConnected || !connectionId || isRegistered}
        >
          {isRegistered ? 'Registered' : 'Register'}
        </button>
      </div>

      <div style={styles.section}>
        <h3>3. Connect to Peer</h3>
        <input
          style={styles.input}
          placeholder="Target Peer ID"
          value={targetId}
          onChange={(e) => setTargetId(e.target.value)}
          disabled={!isRegistered}
        />
        <button 
          style={styles.button(!isRegistered || !targetId)} 
          onClick={connectToPeer}
          disabled={!isRegistered || !targetId}
        >
          Connect to Peer
        </button>
      </div>

      <div style={styles.section}>
        <h3>4. Select and Send File</h3>
        <input 
          type="file" 
          onChange={sendFile} 
          style={styles.fileInput}
          disabled={!isRegistered || !targetId} 
        />
      </div>

      {isReceivingFile && (
        <div style={styles.transferStatus}>
          <h3>Receiving File: {fileName}</h3>
          <p>Received {receivedChunks} chunks{totalChunks ? ` of ${totalChunks}` : ''}</p>
          <div style={styles.progressBar}>
            <div style={styles.progressFill(calculateProgress())}></div>
          </div>
        </div>
      )}

      <div style={styles.section}>
        <h3>📜 Log</h3>
        <div style={styles.log}>
          {log.map((entry, i) => (
            <div key={i} dangerouslySetInnerHTML={{ __html: entry }} />
          ))}
        </div>
      </div>
    </div>
  );
}

export default App; */