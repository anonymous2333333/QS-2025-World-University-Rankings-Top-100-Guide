#!/usr/bin/env python3
"""Build selected, attributed, local WebP campus photos from reviewed Commons choices."""
from pathlib import Path
import importlib.util,json,re,urllib.request,hashlib,concurrent.futures,time,html,argparse,urllib.parse
from PIL import Image,ImageOps
sp=importlib.util.spec_from_file_location('media',Path(__file__).with_name('collect-campus-media.py'));m=importlib.util.module_from_spec(sp);sp.loader.exec_module(m)
ROOT=m.ROOT;CACHE=m.CACHE

def photo(groups,school,group,index):return groups[str(school)][group]['images'][index].copy()
def build_selection():
    original={x['id']:x for x in json.loads((CACHE/'selected.json').read_text())}
    entities={x['id']:x for x in json.loads((CACHE/'entities.json').read_text())}
    groups=json.loads((CACHE/'gallery-candidates.json').read_text())
    covers={8:(1,0),15:(0,0),22:(0,1),26:(1,0),67:(1,0),98:(0,0),13:(0,0),4:(0,1)}
    extras={1:[(0,0),(1,3)],2:[(0,0),(1,0)],3:[(0,0),(1,0)],4:[(1,0)],5:[(2,0),(1,0)],6:[(0,0),(1,0)],7:[(0,0),(1,0)],8:[(0,1),(1,3)],9:[(0,0),(1,1)],10:[(0,1),(1,0)],11:[(0,1),(1,0)],12:[(0,1),(1,1)],13:[(0,1),(1,0)],14:[(0,0),(1,2)],15:[(1,1),(1,2)],16:[(0,0),(1,5)],17:[(0,3),(1,3)],18:[(0,2),(2,4)],19:[(0,0),(1,1)],20:[(0,4),(1,0)]}
    selected=[]
    for idx in range(1,101):
        ident=f'qs2025-{idx:03}'
        entry=entities[ident]
        if idx in covers:cover=photo(groups,idx,*covers[idx])
        else:cover=original[ident]['media'].copy()
        photos=[cover]
        for group,index in extras.get(idx,[]):photos.append(photo(groups,idx,group,index))
        if idx==4:photos.append(original[ident]['media'].copy())
        for n,p in enumerate(photos):
            assert re.search(r'\.(jpe?g|png|webp)$',p['file'],re.I),p['file']
            assert not re.search(r'(watercolou?r|painting|logo|\.pdf$)',p['file'],re.I),p['file']
            p['id']=ident+f'-{n+1}'
            p['institutionId']=ident
            p['schoolName']=entry['name']
            p['isCover']=n==0
            p['caption']=re.sub(r'\s+',' ',p['caption'])[:1200]
            selected.append(p)
    assert len({x['institutionId'] for x in selected if x['isCover']})==100
    (CACHE/'reviewed-selection.json').write_text(json.dumps(selected,ensure_ascii=False,indent=2))
    return selected

def download(photo):
    ident=photo['id'];original=CACHE/(ident+'.original');dest=ROOT/'assets/campuses'/(ident+'.webp')
    try:
        if not original.exists():
            req=urllib.request.Request(photo['downloadUrl'],headers={'User-Agent':m.AGENT})
            with urllib.request.urlopen(req,timeout=45) as response:original.write_bytes(response.read())
        with Image.open(original) as im:
            im=ImageOps.exif_transpose(im).convert('RGB');im.thumbnail((1280,960))
            dest.parent.mkdir(parents=True,exist_ok=True)
            im.save(dest,'WEBP',quality=78,method=6)
            photo.update({'path':dest.relative_to(ROOT).as_posix(),'width':im.width,'height':im.height,'bytes':dest.stat().st_size,'sha256':hashlib.sha256(dest.read_bytes()).hexdigest(),'adaptation':'缩放、移除元数据并转为 WebP；未改变场景内容。'})
        return photo,None
    except Exception as exc:return photo,str(exc)

def main():
    photos=build_selection();accepted=[];failures=[]
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        for p,error in pool.map(download,photos):
            if error:failures.append({'id':p['id'],'file':p['file'],'error':error})
            else:accepted.append(p)
            print(p['id'],('FAILED '+error) if error else str(p['bytes'])+' bytes',flush=True)
    (CACHE/'downloaded.json').write_text(json.dumps(accepted,ensure_ascii=False,indent=2))
    (CACHE/'download-failures.json').write_text(json.dumps(failures,ensure_ascii=False,indent=2))
    print(json.dumps({'accepted':len(accepted),'failures':failures,'totalBytes':sum(p['bytes'] for p in accepted)},ensure_ascii=False),flush=True)

if __name__=='__main__':main()
