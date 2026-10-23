from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from threading import Thread
from playwright.sync_api import sync_playwright
from pathlib import Path
class Quiet(SimpleHTTPRequestHandler):
 def log_message(self,*args): pass
server=ThreadingHTTPServer(('127.0.0.1',8769),Quiet)
Thread(target=server.serve_forever,daemon=True).start()
with sync_playwright() as p:
 browser=p.chromium.launch()
 page=browser.new_page(viewport={'width':390,'height':844},device_scale_factor=1)
 errors=[]
 page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto('http://127.0.0.1:8769/tmp/mobile-design.html')
 page.wait_for_selector('.exam-card')
 assert page.locator('.exam-card').count()==21
 page.locator('[data-exam-class]').nth(1).click()
 assert page.locator('.exam-card').count()==3
 page.locator('#exam-search').fill('olmayan')
 assert page.locator('.exam-card').count()==0
 page.locator('[data-reset-exams]').click()
 assert page.locator('.exam-card').count()==21
 page.locator('#exam-search').fill('5c')
 assert page.locator('.exam-card').count()==3
 page.locator('#exam-search').fill('')
 for theme in ['light','dark']:
  page.emulate_media(color_scheme=theme)
  for width in [320,390,768,1280]:
   page.set_viewport_size({'width':width,'height':844})
   for route in ['exams','classes','analytics']:
    page.evaluate('(r)=>{location.hash="#/"+r;App.render()}',route)
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),(theme,width,route)
    if width==390: page.screenshot(path=f'tmp/{route}-{theme}.png',full_page=True)
 page.evaluate('location.hash="#/classes";App.render()')
 page.locator('.class-card').first.click()
 page.wait_for_selector('.class-hero')
 assert page.locator('.exam-tile').count()==3
 page.locator('.exam-tile').first.click()
 page.wait_for_selector('[data-act="scan"]')
 assert not errors,errors
 print('PASS: search, class filter, reset, navigation; no overflow at 320/390/768/1280px in light and dark themes; no JS errors.')
 browser.close()
server.shutdown()
