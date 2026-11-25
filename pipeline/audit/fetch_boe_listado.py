import re,html,sys,json,time,urllib.request,urllib.parse
def q(rng,d0,d1,page=1):
  p=[('campo[0]','ID_SRC'),('dato[0]','1'),('operador[0]','and'),('campo[4]','ID_RNGS'),('dato[4]',rng),('operador[4]','and'),
     ('campo[12]','FAP'),('dato[12][0]',d0),('dato[12][1]',d1),('page_hits','2000'),('sort_field[0]','FPU'),('sort_order[0]','asc'),('accion','Buscar')]
  if page>1: p.append(('pagina',str(page)))
  u='https://www.boe.es/buscar/legislacion_ava.php?'+urllib.parse.urlencode(p)
  t=urllib.request.urlopen(urllib.request.Request(u,headers={'User-Agent':'Mozilla/5.0 research-probe'}),timeout=120).read().decode('utf-8','ignore')
  t=html.unescape(t); rows=[]
  for b in re.findall(r'<li class="resultado-busqueda">(.*?)</li>\s*</ul>',t,re.S):
    i=re.search(r'BOE-A-\d+-\d+',b).group(0); dem=re.search(r'class="linea-dem">(.*?)</p>',b,re.S); ti=re.search(r'</p>\s*<p>(.*?)</p>',b,re.S)
    rows.append({'id':i,'dem':re.sub(r'\s+',' ',dem.group(1)).strip() if dem else None,'titulo':re.sub(r'\s+',' ',ti.group(1)).strip() if ti else None})
  return rows,t
out={}
for rng in ['1320','1300','1290','1310']:
  allr=[]
  for (a,b) in [('1978-12-29','1995-12-31'),('1996-01-01','2012-12-31'),('2013-01-01','2026-11-25')]:
    rows,t=q(rng,a,b); allr+=rows; time.sleep(0.5)
    if len(rows)>=2000: print('WARN page cap',rng,a)
  out[rng]=allr; print(rng,len(allr),len({r['id'] for r in allr}))
json.dump(out,open(sys.argv[1],'w'),ensure_ascii=False)
