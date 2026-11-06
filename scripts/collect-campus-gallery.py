#!/usr/bin/env python3
"""Find explicitly licensed campus landmark candidates, with cached Commons metadata."""
import importlib.util,json,re,concurrent.futures
from pathlib import Path
spec=importlib.util.spec_from_file_location('media',Path(__file__).with_name('collect-campus-media.py'));m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
QUERIES={
1:['MIT Stata Center','MIT Killian Court Great Dome'],2:['Imperial College Queen Tower','Imperial College Dalby Court'],3:['Oxford Radcliffe Camera','Oxford Bodleian Library exterior'],4:['Harvard Widener Library','Harvard Yard'],5:['Cambridge Kings College chapel exterior','Cambridge Mathematical Bridge'],6:['Stanford Memorial Church exterior','Stanford Hoover Tower'],7:['ETH Zurich main building Polyterrasse','ETH Zurich Honggerberg campus'],8:['National University Singapore University Cultural Centre','National University Singapore University Town'],9:['UCL Wilkins Building','UCL main quad'],10:['Caltech Beckman Auditorium','Caltech turtle pond'],11:['University Pennsylvania College Hall','University Pennsylvania Locust Walk'],12:['Berkeley Campanile','Berkeley Sather Gate'],13:['University Melbourne Old Quadrangle','University Melbourne South Lawn'],14:['Peking University Weiming Lake','Peking University Boya Tower'],15:['Nanyang Technological University The Hive','Nanyang Technological University campus'],16:['Cornell McGraw Tower','Cornell Arts Quad'],17:['University Hong Kong Main Building','University Hong Kong Fung Ping Shan'],18:['University Sydney Quadrangle','University Sydney Great Hall'],19:['UNSW Scientia Building','UNSW Main Walkway'],20:['Tsinghua University Second Gate','Tsinghua University auditorium'],22:['Princeton University Nassau Hall'],26:['EPFL campus Rolex Learning Center'],67:['Korea University campus main building'],98:['POSTECH campus university']}

def search(job):
    index,query=job
    result=m.fetch_json('https://commons.wikimedia.org/w/api.php',{'action':'query','format':'json','generator':'search','gsrnamespace':6,'gsrsearch':query,'gsrlimit':7,'prop':'imageinfo','iiprop':'url|size|extmetadata','iiurlwidth':960})
    accepted=[]
    for p in result.get('query',{}).get('pages',{}).values():
        name=p['title'];info=p.get('imageinfo',[{}])[0];meta=info.get('extmetadata',{})
        get=lambda k:m.text(meta.get(k,{}).get('value',''))
        license=get('LicenseShortName')
        if not re.search(r'(CC BY|CC0|Public domain)',license,re.I):continue
        if re.search(r'(logo|emblem|seal|coat.of.arms|watercolou?r|painting|portrait|\.svg$)',name,re.I):continue
        if info.get('width',0)<500 or info.get('height',0)<250:continue
        accepted.append({'file':name.removeprefix('File:'),'originalUrl':info.get('url'),'downloadUrl':info.get('thumburl') or info.get('url'),'sourceUrl':info.get('descriptionurl'),'author':get('Artist'),'credit':get('Credit'),'license':license,'licenseUrl':get('LicenseUrl'),'caption':get('ImageDescription'),'width':info.get('thumbwidth',info.get('width')),'height':info.get('thumbheight',info.get('height')),'reviewedOn':'2026-11-06','query':query,'searchOrder':p.get('index',99)})
    return index,query,sorted(accepted,key=lambda p:p['searchOrder'])

def main():
    jobs=[(i,q) for i,queries in QUERIES.items() for q in queries]
    results={}
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        for index,query,images in pool.map(search,jobs):
            results.setdefault(str(index),[]).append({'query':query,'images':images})
            print(index,query,'=>',len(images),flush=True)
    (m.CACHE/'gallery-candidates.json').write_text(json.dumps(results,ensure_ascii=False,indent=2))

if __name__ == "__main__": main()
