from pathlib import Path
scripts=['local-store.js','upgrade-core.js','cloud-records.js','v4-model.js','v4-demo.js','v4-app.js']
head='''<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>RentPro — จัดการโกดังให้เช่า</title><meta name="description" content="จัดการโกดัง ผู้เช่า บิลรายเดือน และรับชำระ ค่าน้ำค่าไฟตามต้นทุนจริง"><link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;500;600;700&display=swap" rel="stylesheet"><style>'''
html=head+Path('v4.css').read_text()+'''</style></head><body><div id="root"><div class="loading">กำลังเปิด RentPro…</div></div><div id="print" class="print-only"></div>'''+''.join('<script>\n'+Path(p).read_text()+'\n</script>' for p in scripts)+"</body></html>\n"
Path('index.html').write_text(html)
Path('dist').mkdir(exist_ok=True)
Path('dist/index.html').write_text(html)

example=html.replace('<html lang="th">','<html lang="th" data-rentpro-demo="true">').replace('<title>RentPro — จัดการโกดังให้เช่า</title>','<title>RentPro — ตัวอย่างครบ 4 หลัง</title>')
Path('demo.html').write_text(example)
Path('dist/demo.html').write_text(example)
