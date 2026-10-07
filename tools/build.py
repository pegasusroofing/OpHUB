#!/usr/bin/env python3
"""Builds app.html from the pieces in src/.

  src/app.template.html   the page, with two markers where code is dropped in
  src/css/app.css         all the styling
  src/js/NNN-name.js      the app's code, one file per area, joined in number order

Run from the repo root:   python3 tools/build.py          (writes app.html)
                          python3 tools/build.py --check  (fails if app.html is out of date)

app.html is the file that is deployed and copied into the phone apps, so it
is always committed alongside the src/ change that produced it. Never edit
app.html by hand - edit the piece in src/ and rebuild.
"""
import glob, os, sys
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
def read(p):
    with open(os.path.join(root, p), encoding='utf-8', newline='') as f: return f.read()
tpl = read('src/app.template.html')
css = read('src/css/app.css')
files = sorted(glob.glob(os.path.join(root, 'src/js/*.js')))
js = '\n'.join(read(os.path.relpath(f, root)) for f in files)
assert tpl.count('/*@@BUILD:CSS@@*/') == 1 and tpl.count('/*@@BUILD:JS@@*/') == 1, 'template markers missing'
out = tpl.replace('/*@@BUILD:CSS@@*/', css).replace('/*@@BUILD:JS@@*/', js)
target = os.path.join(root, 'app.html')
if '--check' in sys.argv:
    cur = open(target, encoding='utf-8', newline='').read()
    if cur != out: sys.exit('app.html is out of date - run python3 tools/build.py')
    print('app.html is up to date'); sys.exit(0)
with open(target, 'w', encoding='utf-8', newline='') as f: f.write(out)
print('built app.html from', len(files), 'js files,', len(out), 'characters')
