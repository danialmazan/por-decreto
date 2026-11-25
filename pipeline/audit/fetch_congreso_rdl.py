import json,sys,time,urllib.request,urllib.parse,collections
U='https://www.congreso.es/es/busqueda-de-iniciativas?p_p_id=iniciativas&p_p_lifecycle=2&p_p_state=normal&p_p_mode=view&p_p_resource_id=filtrarListado&p_p_cacheability=cacheLevelPage'
def get(leg,tipo,page):
  data=urllib.parse.urlencode({'_iniciativas_legislatura':leg,'_iniciativas_tipo':tipo,'_iniciativas_paginaActual':page}).encode()
  r=urllib.request.Request(U,data=data,headers={'User-Agent':'Mozilla/5.0 research-probe'})
  return json.load(urllib.request.urlopen(r,timeout=60))
out={}
for leg in range(0,16):
  try: d=get(leg,130,1)
  except Exception as e: print(leg,'ERR',e); continue
  n=d.get('iniciativas_encontradas',0); items=list((d.get('lista_iniciativas') or {}).values())
  p=2
  while len(items)<int(n or 0) and p<20:
    items+=list((get(leg,130,p).get('lista_iniciativas') or {}).values()); p+=1; time.sleep(0.3)
  out[leg]=items
  print(leg,d.get('titulo_contenido'),n,len(items),collections.Counter(i.get('resultado_tram') for i in items).most_common())
  time.sleep(0.3)
json.dump(out,open(sys.argv[1],'w'),ensure_ascii=False)
