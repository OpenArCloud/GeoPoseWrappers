#!/usr/bin/env python3
"""Regenerate the explainer's exact SVG diagrams using Python's standard library.

Run from any directory: python docs/examples/generate-enu-illustrations.py
All 3D axis endpoints are projections of Rz(yaw) Ry(pitch) Rx(roll).
"""
from html import escape
from math import cos, sin, radians, sqrt
from pathlib import Path

OUT = Path(__file__).resolve().parents[1] / "images" / "enu-rotations"
INK, MUTED, GRID = "#142c40", "#506779", "#b5c4ce"
X, Y, Z, ACCENT = "#c73542", "#1265c0", "#16845a", "#7844b8"


def text(x, y, label, size=18, color=INK, weight=400, anchor="start"):
    return (f'<text x="{x:.2f}" y="{y:.2f}" font-size="{size}" fill="{color}" '
            f'font-weight="{weight}" text-anchor="{anchor}">{escape(label)}</text>')


def line(x1, y1, x2, y2, color=GRID, width=2, dashed=False, arrow=False):
    dash = ' stroke-dasharray="6 6"' if dashed else ""
    marker = f' marker-end="url(#{color[1:]})"' if arrow else ""
    return (f'<line x1="{x1:.3f}" y1="{y1:.3f}" x2="{x2:.3f}" y2="{y2:.3f}" '
            f'stroke="{color}" stroke-width="{width}"{dash}{marker}/>')


def dot(x, y, color=INK, r=4):
    return f'<circle cx="{x}" cy="{y}" r="{r}" fill="{color}"/>'


def panel(x, y, w, h):
    return (f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="18" '
            'fill="#f7fafc" stroke="#dce5eb"/>')


def svg(name, width, height, title, description, content):
    markers = "".join(
        f'<marker id="{c[1:]}" markerWidth="9" markerHeight="9" refX="8" refY="4.5" '
        f'orient="auto" markerUnits="userSpaceOnUse"><path d="M0,0 L9,4.5 L0,9 Z" fill="{c}"/></marker>'
        for c in [INK, GRID, X, Y, Z, ACCENT]
    )
    body = (f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" '
            f'viewBox="0 0 {width} {height}" role="img" aria-labelledby="title desc">'
            f'<title id="title">{escape(title)}</title><desc id="desc">{escape(description)}</desc>'
            f'<defs>{markers}</defs><rect width="100%" height="100%" fill="#ffffff"/>'
            '<g font-family="DejaVu Sans, Arial, sans-serif" stroke-linecap="round" stroke-linejoin="round">'
            + "".join(content) + '</g></svg>\n')
    (OUT / name).write_text(body.replace("><", ">\n<"))


def matrix(yaw, pitch, roll):
    a, b, c = map(radians, (yaw, pitch, roll))
    ca, sa, cb, sb, cc, sc = cos(a), sin(a), cos(b), sin(b), cos(c), sin(c)
    return [[ca*cb, ca*sb*sc-sa*cc, ca*sb*cc+sa*sc],
            [sa*cb, sa*sb*sc+ca*cc, sa*sb*cc-ca*sc],
            [-sb, cb*sc, cb*cc]]


def project(v, cx, cy, scale=130):
    e, n, u = v
    # Orthographic view from (1.5 East, 1 North, 2 Up). The asymmetric
    # viewpoint keeps the B2 y and z axes visibly separate.
    a, b, c = 1.5, 1.0, 2.0
    h, length = sqrt(a*a+b*b), sqrt(a*a+b*b+c*c)
    right = (b*e-a*n)/h
    up = (-a*c*e-b*c*n+(a*a+b*b)*u)/(h*length)
    return cx + scale*right, cy - scale*up


def frame(cx, cy, angles):
    out = []
    # Fixed ENU plane and its grid, beneath the colored object axes.
    pts = [project(v, cx, cy) for v in [(-1.05,-1.05,0), (1.05,-1.05,0), (1.05,1.05,0), (-1.05,1.05,0)]]
    out.append('<polygon points="' + ' '.join(f'{x:.2f},{y:.2f}' for x,y in pts) + '" fill="#eaf1f5"/>')
    for k in [-1, -.5, 0, .5, 1]:
        for p, q in [((k,-1.05,0),(k,1.05,0)), ((-1.05,k,0),(1.05,k,0))]:
            out.append(line(*project(p,cx,cy),*project(q,cx,cy),color="#d2dde5",width=1))
    for v, label, dx, dy in [((1.5,0,0),"E",10,6), ((0,1.5,0),"N",-20,6), ((0,0,1.5),"U",7,-3)]:
        out.append(line(cx,cy,*project(v,cx,cy),dashed=True,arrow=True))
        px, py = project(v,cx,cy)
        out.append(text(px+dx,py+dy,label,16,MUTED,600))
    r = matrix(*angles)
    axes = [tuple(r[i][j] for i in range(3)) for j in range(3)]
    for v, label, color in zip(axes, ["x", "y", "z"], [X,Y,Z]):
        px, py = project(v,cx,cy,137)
        out.append(line(cx,cy,px,py,color,4,arrow=True))
        dx = 10 if px >= cx-1 else -14
        dy = -7 if py < cy else 18
        out.append(text(px+dx,py+dy,label,21,color,700))
    out.append(dot(cx,cy))
    return out


def yaw_figure():
    out = [text(36,46,"Positive yaw: East toward North",30,weight=700),
           text(36,78,"Top view from +Up, looking down at the tangent plane",18,MUTED)]
    for i, (title, yaw, caption) in enumerate([
        ("A0 · No rotation",0,"Object x = East; object y = North"),
        ("A1 · Yaw +90°",90,"Object x = North; object y = West")]):
        bx=28+i*490
        out += [panel(bx,108,464,366),text(bx+24,145,title,23,weight=700)]
        cx,cy=bx+218,318
        for off in [-120,-60,0,60,120]:
            if off <= 70:
                out += [line(cx-150,cy+off,cx+150,cy+off,"#e0e8ed",1)]
            out += [line(cx+off,cy-135,cx+off,cy+70,"#e0e8ed",1)]
        out += [line(cx-150,cy,cx+166,cy,dashed=True,arrow=True),line(cx,cy+70,cx,cy-143,dashed=True,arrow=True),
                text(cx+175,cy+6,"E",17,MUTED,600),text(cx-6,cy-153,"N",17,MUTED,600)]
        a=radians(yaw)
        out += [line(cx,cy,cx+118*cos(a),cy-118*sin(a),X,4,arrow=True),
                line(cx,cy,cx-118*sin(a),cy-118*cos(a),Y,4,arrow=True)]
        if i==0:
            out += [text(cx+116,cy+25,"x",22,X,700),text(cx+13,cy-106,"y",22,Y,700)]
        else:
            out += [text(cx+13,cy-106,"x",22,X,700),text(cx-132,cy+25,"y",22,Y,700),
                    f'<path d="M {cx+65},{cy} A 65,65 0 0 0 {cx},{cy-65}" fill="none" stroke="{ACCENT}" stroke-width="3" marker-end="url(#{ACCENT[1:]})"/>',
                    text(cx+59,cy-75,"+90°",18,ACCENT,700)]
        out += [f'<circle cx="{cx}" cy="{cy}" r="10" fill="white" stroke="{Z}" stroke-width="2"/>',dot(cx,cy,Z,3),
                text(bx+24,424,caption,17),text(bx+24,452,"⊙ z = Up, out of the page",16,Z)]
    out += [text(36,513,"Right-hand rule: thumb points Up; curled fingers show positive yaw.",18,weight=600),
            text(36,543,"Gray dashed axes stay fixed. Colored axes belong to the rotating object.",17,MUTED)]
    svg("01-positive-yaw.svg",1000,568,"Positive right-handed yaw in an ENU tangent plane",
        "Two top views: at zero yaw, x points East and y points North. At positive 90-degree yaw, x points North and y points West. z stays Up toward the viewer. The curved arrow runs counterclockwise from East to North.",out)


def sequence_figure():
    out=[text(36,46,"Three rotations, three moving axes",30,weight=700),
         text(36,78,"Intrinsic Z → Y → X · values below are (yaw, pitch, roll), in degrees",18,MUTED)]
    stages=[("B0 · Start",(0,0,0),"ENU and object axes align.","x = East; y = North; z = Up"),
            ("B1 · +90° about z",(90,0,0),"Yaw axis is Up.","x = North; y = West; z = Up"),
            ("B2 · +45° about rotated y",(90,45,0),"Pitch axis now points West.","x tips down; z tips toward North"),
            ("B3 · +90° about rotated x",(90,45,90),"Roll axis points North and down.","x stays fixed; y rises; z = East")]
    for i,(title,angles,note,caption) in enumerate(stages):
        bx=28+(i%2)*490; by=108+(i//2)*448
        out += [panel(bx,by,464,426),text(bx+22,by+35,title,21,weight=700),
                text(bx+22,by+64,str(angles)+"°",17,ACCENT,600)]
        out += frame(bx+230,by+218,angles)
        out += [text(bx+22,by+375,note,17,weight=600),text(bx+22,by+403,caption,16,MUTED)]
    out += [text(36,1035,"Fixed frame: E / N / U (gray). Rotating object: x (red), y (blue), z (green).",17,MUTED),
            text(36,1065,"Each new rotation uses the object axis after all preceding steps.",18,weight=600)]
    svg("02-intrinsic-sequence.svg",1000,1090,"Intrinsic yaw, pitch and roll sequence in ENU",
        "Four exact projected frames: identity; yaw 90 degrees; yaw 90 and pitch 45 degrees; yaw 90, pitch 45 and roll 90 degrees. Pitch is about the rotated y axis pointing West. Roll is about the rotated x axis pointing North and down. The fixed ENU tangent plane remains visible in every panel.",out)


def pitch_figure():
    cx,cy=540,310
    out=[text(36,46,"Why positive pitch tips +x downward here",29,weight=700),
         text(36,78,"After yaw +90°: look from West toward East, along the rotated y axis",17,MUTED),
         panel(28,108,944,410)]
    out += [line(cx-300,cy,cx+290,cy,dashed=True,arrow=True),line(cx,cy+155,cx,cy-145,dashed=True,arrow=True),
            text(cx-320,cy-14,"North",18,MUTED,600),text(cx+260,cy-14,"South",18,MUTED,600),text(cx+13,cy-145,"Up",18,MUTED,600)]
    out += [line(cx,cy,cx-205,cy,X,2,dashed=True,arrow=True),text(cx-239,cy-18,"x before",18,X,600),
            line(cx,cy,cx,cy-113,Z,2,dashed=True,arrow=True),text(cx+16,cy-100,"z before",17,Z,600)]
    out += [line(cx,cy,cx-205/sqrt(2),cy+205/sqrt(2),X,4,arrow=True),
            text(cx-320,cy+159,"x after +45°",19,X,700),
            line(cx,cy,cx-160/sqrt(2),cy-160/sqrt(2),Z,4,arrow=True),
            text(cx-242,cy-120,"z after +45°",19,Z,700)]
    out += [f'<path d="M {cx-74},{cy} A 74,74 0 0 0 {cx-74/sqrt(2):.3f},{cy+74/sqrt(2):.3f}" fill="none" stroke="{ACCENT}" stroke-width="3" marker-end="url(#{ACCENT[1:]})"/>',
            text(cx-120,cy+71,"+45°",18,ACCENT,700),
            f'<circle cx="{cx}" cy="{cy}" r="12" fill="white" stroke="{Y}" stroke-width="2"/>',dot(cx,cy,Y,4),
            text(cx+27,cy+42,"⊙ y points West, toward you",17,Y,600),
            text(52,493,"Positive remains counterclockwise when viewed from the positive rotation axis.",17,weight=600),
            text(36,554,"The sign follows the axes, not the aviation phrase “nose up”.",19,weight=600),
            text(36,584,"Here object +x is forward and +z is up before pitch. Different body axes need an explicit mapping.",16,MUTED)]
    svg("03-positive-pitch.svg",1000,610,"Positive pitch about the rotated y axis",
        "View from West toward East after positive 90-degree yaw. The rotated positive y axis points toward the viewer. North is left and Up is above. A positive 45-degree counterclockwise pitch turns the North-pointing x axis downward, and tilts z toward North. The y axis remains unchanged.",out)


if __name__ == "__main__":
    OUT.mkdir(parents=True,exist_ok=True)
    yaw_figure()
    sequence_figure()
    pitch_figure()
    print(f"Wrote 3 SVG illustrations to {OUT}")
