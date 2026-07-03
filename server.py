import http.server
import socketserver
import webbrowser
import threading
import sys
import time

PORT = 8080
Handler = http.server.SimpleHTTPRequestHandler

def open_browser():
    # 稍等半秒待服务器启动
    time.sleep(0.5)
    print(f"正在浏览器中打开 ChocoZAP 健身助手: http://localhost:{PORT}")
    webbrowser.open(f"http://localhost:{PORT}/index.html")

def start_server():
    # 允许端口重用
    socketserver.TCPServer.allow_reuse_address = True
    try:
        with socketserver.TCPServer(("", PORT), Handler) as httpd:
            print(f"服务器已在端口 {PORT} 启动 (按 Ctrl+C 退出)")
            httpd.serve_forever()
    except Exception as e:
        print(f"无法启动本地服务器: {e}")
        print("您也可以直接双击 index.html 在浏览器中运行。")
        input("按任意键退出...")

if __name__ == "__main__":
    # 使用线程启动浏览器打开，防止阻塞服务器启动
    threading.Thread(target=open_browser, daemon=True).start()
    start_server()
