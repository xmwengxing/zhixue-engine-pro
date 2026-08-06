"""
PDF → PNG pages renderer (stdin/stdout JSON protocol)
协议：
  stdin: {"pdfBase64": "...", "maxPages": n, "scale": 2.0}
  stdout: {"pages": [{"index": 0, "base64": "..."}], "count": 2}
  stderr: 错误时输出 {"error": "..."} 后退出非零
"""
import sys
import json
import base64
import fitz  # PyMuPDF


def main():
    payload = json.loads(sys.stdin.read())
    pdf_bytes = base64.b64decode(payload['pdfBase64'])
    max_pages = int(payload.get('maxPages', 20))
    scale = float(payload.get('scale', 2.0))
    doc = fitz.open(stream=pdf_bytes, filetype='pdf')
    n = min(len(doc), max_pages)
    pages = []
    for i in range(n):
        page = doc[i]
        pix = page.get_pixmap(matrix=fitz.Matrix(scale, scale))
        png_bytes = pix.tobytes('png')
        pages.append({'index': i, 'base64': base64.b64encode(png_bytes).decode('ascii')})
        # 显式释放大对象
        pix = None
    sys.stdout.write(json.dumps({'count': len(pages), 'pages': pages}))
    sys.stdout.flush()


if __name__ == '__main__':
    try:
        main()
    except Exception as e:
        sys.stderr.write(json.dumps({'error': str(e)}))
        sys.exit(1)