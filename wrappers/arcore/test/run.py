"""Compile the real Kotlin wrapper on a JDK; pinned dependencies from Maven Central.
Run from any directory: python wrappers/arcore/test/run.py
Downloaded jars/build output live in the OS temporary directory, outside the repo.
"""
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import os
import subprocess
import tempfile
import urllib.request

root = Path(__file__).resolve().parents[3]
cache = Path(tempfile.gettempdir()) / 'geopose-kotlin-2.1.21'
cache.mkdir(exist_ok=True)
artifacts = [
    ('org.jetbrains.kotlin', 'kotlin-compiler-embeddable', '2.1.21'),
    ('org.jetbrains.kotlin', 'kotlin-stdlib', '2.1.21'),
    ('org.jetbrains.kotlin', 'kotlin-script-runtime', '2.1.21'),
    ('org.jetbrains.kotlin', 'kotlin-reflect', '1.6.10'),
    ('org.jetbrains.kotlin', 'kotlin-daemon-embeddable', '2.1.21'),
    ('org.jetbrains.intellij.deps', 'trove4j', '1.0.20200330'),
    ('org.jetbrains.kotlinx', 'kotlinx-coroutines-core-jvm', '1.8.0'),
    ('org.jetbrains', 'annotations', '13.0'),
    ('org.json', 'json', '20240303'),
]
def download(spec):
    group, artifact, version = spec
    name = f'{artifact}-{version}.jar'
    path = cache / name
    if not path.exists():
        url = f'https://repo.maven.apache.org/maven2/{group.replace(".", "/")}/{artifact}/{version}/{name}'
        data = urllib.request.urlopen(url, timeout=120).read()
        path.write_bytes(data)
    return str(path)
with ThreadPoolExecutor(max_workers=4) as pool:
    jars = list(pool.map(download, artifacts))
classpath = os.pathsep.join(jars)
output = cache / 'tests.jar'
java = os.environ.get('GEOPOSE_JAVA', 'java')
subprocess.run([java, '-cp', classpath, 'org.jetbrains.kotlin.cli.jvm.K2JVMCompiler',
    '-no-stdlib', '-no-reflect', '-classpath', classpath, '-d', str(output),
    str(root/'wrappers/arcore/GeoPoseConverter.kt'), str(Path(__file__).with_name('RotationTest.kt'))], check=True)
subprocess.run([java, '-cp', str(output)+os.pathsep+classpath,
    'org.ogc.geopose.wrappers.arcore.RotationTestKt', str(root/'docs/examples/enu-rotation-poses.json')], check=True)
