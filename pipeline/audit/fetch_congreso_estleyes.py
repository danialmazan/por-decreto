import re,html,sys,json,time,urllib.request
out={}
for y in range(1979,2026):
  t=html.unescape(urllib.request.urlopen(urllib.request.Request('https://app.congreso.es/est_leyes/do/get?v=%d&action=load'%y,headers={'User-Agent':'Mozilla/5.0 research-probe'}),timeout=60).read().decode('utf-8','ignore'))
  parts=re.split(r'<li class="type"><span>([^<]+)</span>',t)
  out[y]={parts[i].strip():re.findall(r"class=\"file\"><a[^>]*>([^<]+)</a>",parts[i+1]) for i in range(1,len(parts),2)}
  time.sleep(0.3)
json.dump(out,open(sys.argv[1],'w'),ensure_ascii=False)
