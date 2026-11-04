"""Generate the sample's original, MIT-licensed, metre-scale GLBs. No external assets."""
import argparse
import json
import math
from pathlib import Path
import struct

OUT = Path(__file__).resolve().parents[1] / 'Samples~/OscpAr/Assets'


def glb(triangles, color):
    positions, normals = [], []
    for a, b, c in triangles:
        u, v = [b[i]-a[i] for i in range(3)], [c[i]-a[i] for i in range(3)]
        n = [u[1]*v[2]-u[2]*v[1], u[2]*v[0]-u[0]*v[2], u[0]*v[1]-u[1]*v[0]]
        length = math.sqrt(sum(x*x for x in n))
        assert length > 0
        positions.extend([a,b,c]); normals.extend([[x/length for x in n]]*3)
    pos = b''.join(struct.pack('<3f', *v) for v in positions)
    normal = b''.join(struct.pack('<3f', *v) for v in normals)
    data = pos+normal
    doc = {
        'asset': {'version':'2.0','generator':'OpenArCloud GeoPose sample generator (MIT)'},
        'scene':0,'scenes':[{'nodes':[0]}],'nodes':[{'mesh':0}],
        'meshes':[{'primitives':[{'attributes':{'POSITION':0,'NORMAL':1},'material':0}]}],
        'materials':[{'pbrMetallicRoughness':{'baseColorFactor':color,'metallicFactor':0,'roughnessFactor':0.85},'doubleSided':True}],
        'buffers':[{'byteLength':len(data)}],
        'bufferViews':[{'buffer':0,'byteOffset':0,'byteLength':len(pos),'target':34962},{'buffer':0,'byteOffset':len(pos),'byteLength':len(normal),'target':34962}],
        'accessors':[{'bufferView':0,'componentType':5126,'count':len(positions),'type':'VEC3','min':[min(v[i] for v in positions) for i in range(3)],'max':[max(v[i] for v in positions) for i in range(3)]},{'bufferView':1,'componentType':5126,'count':len(normals),'type':'VEC3'}]
    }
    raw = json.dumps(doc,separators=(',',':')).encode(); raw += b' '*((-len(raw))%4)
    return struct.pack('<III',0x46546c67,2,12+8+len(raw)+8+len(data))+struct.pack('<II',len(raw),0x4e4f534a)+raw+struct.pack('<II',len(data),0x004e4942)+data


def prism(polygon, height):
    # Polygon describes the X/Z footprint; Y is up. +Z is the model's visual forward.
    bottom = [(x,0,z) for x,z in polygon]; top = [(x,height,z) for x,z in polygon]
    result=[]
    # Supplied polygons are star-shaped around the origin, so a centre fan is valid.
    for i in range(len(polygon)):
        j=(i+1)%len(polygon)
        result += [(bottom[i],bottom[j],top[j]),(bottom[i],top[j],top[i]),
                   ((0,0,0),bottom[j],bottom[i]),((0,height,0),top[i],top[j])]
    return [(a,c,b) for a,b,c in result]  # outward winding in right-handed glTF coordinates


def main():
    parser=argparse.ArgumentParser(); parser.add_argument('--check',action='store_true'); args=parser.parse_args()
    assets={
        'marker.glb':glb(prism([(-.2,-.2),(.2,-.2),(.2,.2),(-.2,.2)],.45),[.1,.65,1,1]),
        'arrow.glb':glb(prism([(-.12,-.4),(.12,-.4),(.12,.08),(.35,.08),(0,.65),(-.35,.08),(-.12,.08)],.12),[1,.55,.05,1])
    }
    OUT.mkdir(parents=True,exist_ok=True)
    for name,data in assets.items():
        path=OUT/name
        if args.check:
            assert path.read_bytes()==data, f'{name} differs from its generator'
            magic,version,size=struct.unpack_from('<III',data)
            assert magic==0x46546c67 and version==2 and size==len(data)
        else: path.write_bytes(data)
    print(('Verified' if args.check else 'Generated')+' 2 GLB assets')


if __name__=='__main__': main()
