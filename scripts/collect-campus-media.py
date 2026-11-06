#!/usr/bin/env python3
"""Collect institution P18 photographs and explicit reuse metadata; never infer a licence.

Network responses are cached outside the repository. The accepted manifest is committed
alongside local, compressed WebP derivatives; photo identity is reviewed with contact sheets.
"""
from pathlib import Path
import json,urllib.request,urllib.parse,time,re,html,hashlib,concurrent.futures,sys
ROOT=Path(__file__).resolve().parent.parent
CACHE=ROOT.parent/'media-research';CACHE.mkdir(exist_ok=True)
AGENT='QSUniversityExplorer/3.0 (https://github.com/anonymous2333333/QS-2025-World-University-Rankings-Top-100-Guide; educational campus guide)'
TITLES='''Massachusetts Institute of Technology
Imperial College London
University of Oxford
Harvard University
University of Cambridge
Stanford University
ETH Zurich
National University of Singapore
University College London
California Institute of Technology
University of Pennsylvania
University of California, Berkeley
University of Melbourne
Peking University
Nanyang Technological University
Cornell University
University of Hong Kong
University of Sydney
University of New South Wales
Tsinghua University
University of Chicago
Princeton University
Yale University
PSL University
University of Toronto
École Polytechnique Fédérale de Lausanne
University of Edinburgh
Technical University of Munich
McGill University
Australian National University
Seoul National University
Johns Hopkins University
University of Tokyo
Columbia University
University of Manchester
Chinese University of Hong Kong
Monash University
University of British Columbia
Fudan University
King's College London
University of Queensland
University of California, Los Angeles
New York University
University of Michigan
Shanghai Jiao Tong University
Institut Polytechnique de Paris
Hong Kong University of Science and Technology
Zhejiang University
Delft University of Technology
Kyoto University
Northwestern University
London School of Economics
KAIST
University of Bristol
University of Amsterdam
Yonsei University
Hong Kong Polytechnic University
Carnegie Mellon University
Ludwig Maximilian University of Munich
University of Malaya
Duke University
City University of Hong Kong
KU Leuven
Sorbonne University
University of Auckland
University of Texas at Austin
Korea University
National Taiwan University
University of Warwick
University of Illinois Urbana-Champaign
University of Buenos Aires
University of California, San Diego
Paris-Saclay University
KTH Royal Institute of Technology
Lund University
University of Washington
University of Western Australia
University of Glasgow
Brown University
University of Birmingham
University of Southampton
University of Adelaide
University of Leeds
Heidelberg University
Tokyo Institute of Technology
Osaka University
Trinity College Dublin
University of Technology Sydney
Durham University
Pennsylvania State University
Purdue University
University of São Paulo
Pontifical Catholic University of Chile
Moscow State University
National Autonomous University of Mexico
University of Alberta
Free University of Berlin
Pohang University of Science and Technology
RWTH Aachen University
University of Copenhagen'''.splitlines()

def fetch_json(endpoint,params):
    url=endpoint+'?'+urllib.parse.urlencode(params)
    cache=CACHE/(hashlib.sha256(url.encode()).hexdigest()+'.json')
    if cache.exists():return json.loads(cache.read_text())
    req=urllib.request.Request(url,headers={'User-Agent':AGENT,'Accept':'application/json'})
    with urllib.request.urlopen(req,timeout=45) as response:data=json.load(response)
    if 'error' in data:raise ValueError(str(data['error']))
    cache.write_text(json.dumps(data,ensure_ascii=False))
    return data

def text(value):return re.sub(r'\s+',' ',html.unescape(re.sub('<[^>]+>',' ',value or ''))).strip()

def collect():
    rows=json.loads((ROOT/'data/universities.json').read_text())
    assert len(TITLES)==len(rows)==100
    pages={}
    redirects={}
    for start in [0,50]:
        data=fetch_json('https://en.wikipedia.org/w/api.php',{'action':'query','format':'json','redirects':1,'prop':'pageprops','titles':'|'.join(TITLES[start:start+50])})
        redirects.update({r['from']:r['to'] for r in data.get('query',{}).get('redirects',[])})
        pages.update({p['title']:p for p in data.get('query',{}).get('pages',{}).values()})
    linked=[]
    for row,title in zip(rows,TITLES):
        resolved=redirects.get(title,title)
        page=pages.get(resolved,{})
        qid=page.get('pageprops',{}).get('wikibase_item')
        linked.append({'id':row['id'],'name':row['name'],'title':resolved,'wikidataId':qid})
    missing=[x for x in linked if not x['wikidataId']]
    print('Missing entities:',json.dumps(missing,ensure_ascii=False),flush=True)
    entities={}
    ids=[x['wikidataId'] for x in linked if x['wikidataId']]
    for start in range(0,len(ids),40):
        data=fetch_json('https://www.wikidata.org/w/api.php',{'action':'wbgetentities','format':'json','ids':'|'.join(ids[start:start+40]),'props':'claims|labels','languages':'en|zh'})
        entities.update(data.get('entities',{}))
    for row in linked:
        entity=entities.get(row['wikidataId'],{})
        claims=entity.get('claims',{})
        row['entityLabel']=entity.get('labels',{}).get('en',{}).get('value','')
        row['candidates']=[x.get('mainsnak',{}).get('datavalue',{}).get('value') for x in claims.get('P18',[])]
        row['website']=[x.get('mainsnak',{}).get('datavalue',{}).get('value') for x in claims.get('P856',[])]
        row['coordinates']=[x.get('mainsnak',{}).get('datavalue',{}).get('value') for x in claims.get('P625',[])]
    (CACHE/'entities.json').write_text(json.dumps(linked,ensure_ascii=False,indent=2))
    all_titles=list(dict.fromkeys('File:'+name for row in linked for name in row['candidates'] if isinstance(name,str)))
    images={}
    for start in range(0,len(all_titles),40):
        data=fetch_json('https://commons.wikimedia.org/w/api.php',{'action':'query','format':'json','prop':'imageinfo','iiprop':'url|size|extmetadata','iiurlwidth':960,'titles':'|'.join(all_titles[start:start+40])})
        images.update({p['title']:p for p in data.get('query',{}).get('pages',{}).values()})
    (CACHE/'images.json').write_text(json.dumps(images,ensure_ascii=False,indent=2))
    accepted=[];unresolved=[]
    for row in linked:
        choices=[]
        for name in row['candidates']:
            info=images.get('File:'+str(name),{}).get('imageinfo',[{}])[0]
            meta=info.get('extmetadata',{})
            def get(key):return text(meta.get(key,{}).get('value',''))
            licence=get('LicenseShortName')
            if not re.search(r'(CC BY|CC0|Public domain)',licence,re.I):continue
            if re.search(r'(logo|emblem|seal|coat.of.arms|shield|\.svg$)',str(name),re.I):continue
            if info.get('width',0)<400 or info.get('height',0)<200:continue
            choices.append({'file':name,'originalUrl':info.get('url'),'downloadUrl':info.get('thumburl') or info.get('url'),'sourceUrl':info.get('descriptionurl'),'author':get('Artist'),'credit':get('Credit'),'license':licence,'licenseUrl':get('LicenseUrl'),'caption':get('ImageDescription'),'width':info.get('thumbwidth',info.get('width')),'height':info.get('thumbheight',info.get('height')),'reviewedOn':'2026-11-06'})
        if not choices:unresolved.append(row)
        else:accepted.append({**row,'media':choices[0],'alternatives':choices[1:]})
    (CACHE/'selected.json').write_text(json.dumps(accepted,ensure_ascii=False,indent=2))
    (CACHE/'unresolved.json').write_text(json.dumps(unresolved,ensure_ascii=False,indent=2))
    print(json.dumps({'accepted':len(accepted),'unresolved':[(x['id'],x['name'],x['candidates']) for x in unresolved]},ensure_ascii=False),flush=True)

if __name__=='__main__':collect()
