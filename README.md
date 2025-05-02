# 📁 P2P File Transfer

> Lightweight peer-to-peer file sharing over WebSockets. Splits files into 64KB chunks, streams in real time, and reassembles for download.

---

## ⚙️ Prerequisites

* **Rust** 1.70+ (with Cargo)
* **Node.js** 14+ & **npm** or **yarn**

Verify setup:

```bash
rustc --version && cargo --version
node --version && npm --version
```

---

## 🚀 Quickstart

1. **Clone the repo**

   ```bash
   git clone [https://github.com/NgrTushar/p2p-file-transfer.git](https://github.com/NgrTushar/p2p-file-transfer.git)
   cd p2p-file-transfer
   ```



````

2. **Start the backend**
   ```bash
cd backend
cargo run
````

The server listens at `ws://0.0.0.0:8000/ws`.

3. **Start the frontend**

   ```bash
   cd frontend
   npm install      # or yarn install
   npm run dev      # or yarn dev
   ```



```
   Open `http://localhost:3000` in your browser.

---

## 🎯 Features

- **Rust + Axum** WebSocket server
- **ID-Based Pairing** for connecting peers
- **Chunked Transfer**: 64KB binary frames
- **Live Logs**: connection, send/receive, and error events
- **Automatic Assembly**: combine chunks into a Blob with download link

---

## 📂 Project Structure

```

p2p-file-transfer/
├── backend/        # Rust WebSocket server
│   ├── Cargo.toml
│   └── src/main.rs
└── frontend/       # React client
├── package.json
└── src/App.js

```

---

## 🤝 Contributing

Open issues or pull requests for improvements.

---

## 📄 License

This project is licensed under the MIT License. See [LICENSE](LICENSE) for details.

```

