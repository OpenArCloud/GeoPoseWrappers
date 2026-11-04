using System;
using System.Threading;
using System.Threading.Tasks;
using GLTFast;
using UnityEngine;

namespace OpenArCloud.GeoPose.Samples
{
    // One import per anchor keeps meshes/materials alive for exactly as long as the instance.
    public sealed class GlbAsset : MonoBehaviour
    {
        private GltfImport import;
        private bool destroyed;
        public async Task Load(string uri,CancellationToken cancellation)
        {
            import=new GltfImport();
            try
            {
                if(!await import.Load(uri,cancellationToken:cancellation)) throw new InvalidOperationException("Could not load GLB asset.");
                cancellation.ThrowIfCancellationRequested();
                if(destroyed) throw new OperationCanceledException();
                if(!await import.InstantiateMainSceneAsync(transform,cancellationToken:cancellation)) throw new InvalidOperationException("Could not instantiate GLB asset.");
            }
            catch { if(import!=null) { import.Dispose(); import=null; } throw; }
        }
        private void OnDestroy() { destroyed=true; if(import!=null) { import.Dispose(); import=null; } }
    }
}
