# Developer helper: multiply every damage/tickDamage number of a monster in monsters.js.
# Usage: python3 tools/bake.py korvak=0.885 velumora=1.23 ...
import re, sys
p = 'src/data/monsters.js'
s = open(p).read()
order = ['korvak', 'velumora', 'oruvex', 'canopyx', 'prismor']
starts = [s.index(f"  {m}: {{\n    id: '{m}'") for m in order]
end = s.index('export const MONSTER_ORDER')
scales = dict(a.split('=') for a in sys.argv[1:])
out = s[:starts[0]]
for i, m in enumerate(order):
    block = s[starts[i]:(starts[i + 1] if i + 1 < len(order) else end)]
    k = float(scales.get(m, 1))
    block = re.sub(r'(\b(?:damage|tickDamage): )(\d+)', lambda mm: mm.group(1) + str(max(1, round(int(mm.group(2)) * k))), block)
    out += block
out += s[end:]
open(p, 'w').write(out)
