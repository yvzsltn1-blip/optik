from pathlib import Path
from playwright.sync_api import sync_playwright
import json, base64

out = Path('tmp/design-check'); out.mkdir(exist_ok=True)
with sync_playwright() as p:
    browser = p.chromium.launch()
    context = browser.new_context(viewport={'width':390,'height':844}, device_scale_factor=1, service_workers='block')
    context.route('**/js/cloud.js', lambda r: r.fulfill(status=200, content_type='text/javascript', body=''))
    page = context.new_page()
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto('http://127.0.0.1:8766/tests/seed.html')
    page.wait_for_function("document.title.startsWith('SEEDED')")
    exam_id = page.title().split()[-1]
    page.evaluate('''() => {
      const e = Store.exams().find(e=>e.questionCount===40);
      Store.saveExam({...e, scoring:'puan', topics:[{name:'Çarpanlar ve katlar',from:1,to:10},{name:'Üslü ifadeler',from:11,to:20},{name:'Kareköklü ifadeler',from:21,to:30},{name:'Veri analizi ve olasılık',from:31,to:40}]});
    }''')
    base = 'http://127.0.0.1:8766/app/'
    page.goto(base + '#/exam/' + exam_id + '/stats')
    page.locator('.analysis-hero').wait_for()
    page.screenshot(path=str(out/'analysis-mobile.png'), full_page=True)
    checks = []
    for width in [320,375,390,430,768,1440]:
        page.set_viewport_size({'width':width,'height':900})
        for route in ['stats','', 'key']:
            page.goto(base+'#/exam/'+exam_id+('/'+route if route else ''))
            page.wait_for_function('(expected) => document.querySelector("#view").dataset.page === expected', arg=route or 'exam')
            overflow = page.evaluate('document.documentElement.scrollWidth > innerWidth')
            assert not overflow, f'overflow width={width} route={route}'
            checks.append(f'{width}px {route or "exam"}: no overflow')
    page.set_viewport_size({'width':390,'height':844})
    page.goto(base+'#/exam/'+exam_id+'/stats')
    page.locator('.question-card').first.click()
    page.locator('#modal:not([hidden])').wait_for()
    page.screenshot(path=str(out/'question-mobile.png'))
    page.locator('#modal [data-close]').last.click()
    page.locator('summary').first.click()
    page.locator('.question-link').first.click()
    assert page.locator('#modal').is_visible()
    page.locator('#modal [data-close]').last.click()
    page.locator('summary').last.click()
    assert not page.evaluate('document.documentElement.scrollWidth > innerWidth'), 'expanded table overflow'
    student_id = page.evaluate('Store.students(Store.getExam('+exam_id+').classId)[0].id')
    page.goto(base+f'#/result/{exam_id}/{student_id}')
    page.locator('.result-score').wait_for()
    page.screenshot(path=str(out/'result-mobile.png'), full_page=True)
    page.goto(base+'#/exam/'+exam_id+'/stats')
    page.set_viewport_size({'width':1440,'height':1000})
    page.screenshot(path=str(out/'analysis-desktop.png'), full_page=True)
    page.emulate_media(color_scheme='dark')
    page.set_viewport_size({'width':390,'height':844})
    page.screenshot(path=str(out/'analysis-dark.png'), full_page=True)
    assert not errors, errors
    print(json.dumps({'checks':checks,'interactions':'question modal, table, matrix passed','errors':errors},ensure_ascii=False))
    browser.close()
