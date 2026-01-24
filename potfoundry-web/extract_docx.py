
import zipfile
import re
import sys
import os

docx_path = sys.argv[1]
try:
    if not os.path.exists(docx_path):
        print(f"File not found: {docx_path}")
        sys.exit(1)
        
    with zipfile.ZipFile(docx_path) as z:
        xml_content = z.read('word/document.xml').decode('utf-8')
        # Find all <w:t> content
        matches = re.findall(r'<w:t[^>]*>(.*?)</w:t>', xml_content)
        text = ' '.join(matches)
        print(text)
except Exception as e:
    print(f"Error reading docx: {e}")
