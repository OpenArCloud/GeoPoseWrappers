using System;
using System.Collections;
using System.Threading;
using System.Threading.Tasks;
using OpenArCloud.GeoPose.Unity;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.XR.ARFoundation;
using UnityEngine.XR.ARSubsystems;

namespace OpenArCloud.GeoPose.Samples
{
    public sealed class CapturedCamera
    {
        public CameraSubmission Image;
        public Pose3d TrackedPose;
        public Texture2D Preview;
        public ScreenOrientation ScreenOrientation;
    }
    // Capture the provider's DISPLAY-oriented background only (no virtual objects or UI).
    // Its crop/orientation is the same as the AR camera projection, unlike a raw CPU sensor image.
    public sealed class ArBackgroundCapture : MonoBehaviour
    {
        public Camera arCamera;
        public ARCameraManager cameraManager;
        public ARCameraBackground background;
        private TaskCompletionSource<CapturedCamera> pending;
        private float lastFrame=-100;
        private void OnEnable() { cameraManager.frameReceived+=OnFrame; }
        private void OnDisable() { cameraManager.frameReceived-=OnFrame; pending?.TrySetCanceled(); pending=null; }
        private void OnFrame(ARCameraFrameEventArgs args) { lastFrame=Time.realtimeSinceStartup; }
        public Task<CapturedCamera> Capture(int longEdge,CancellationToken ct)
        {
            if(pending!=null) throw new InvalidOperationException("Capture is already in progress.");
            pending=new TaskCompletionSource<CapturedCamera>(); var task=pending.Task;
            StartCoroutine(CaptureAtEndOfFrame(Mathf.Clamp(longEdge,320,1920),ct)); return task;
        }
        private IEnumerator CaptureAtEndOfFrame(int longEdge,CancellationToken ct)
        {
            yield return new WaitForEndOfFrame();
            var completion=pending; pending=null; if(completion==null) yield break;
            RenderTexture rt=null; Texture2D image=null; var previous=RenderTexture.active;
            try
            {
                ct.ThrowIfCancellationRequested();
                if(ARSession.state!=ARSessionState.SessionTracking || Time.realtimeSinceStartup-lastFrame>0.25f || background.material==null)
                    throw new InvalidOperationException("Wait for fresh AR camera tracking before localizing.");
                if(cameraManager.currentFacingDirection!=CameraFacingDirection.World) throw new InvalidOperationException("Use the rear, non-mirrored camera.");
                if(arCamera.rect!=new Rect(0,0,1,1)) throw new InvalidOperationException("The demo requires a full-viewport AR camera.");
                float scale=(float)longEdge/Mathf.Max(arCamera.pixelWidth,arCamera.pixelHeight);
                int width=Mathf.RoundToInt(arCamera.pixelWidth*scale),height=Mathf.RoundToInt(arCamera.pixelHeight*scale);
                var projection=arCamera.projectionMatrix;
                var pose=arCamera.transform.WorldPose(); // retained across the network round trip
                long time=DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
                rt=RenderTexture.GetTemporary(width,height,0,RenderTextureFormat.ARGB32);
                RenderTexture.active=rt;
                using(var command=new CommandBuffer())
                {
                    command.ClearRenderTarget(true,true,Color.black);
                    var material=background.material;
                    Texture texture=material.HasProperty("_MainTex")?material.GetTexture("_MainTex"):null;
                    command.Blit(texture,BuiltinRenderTextureType.CurrentActive,material);
                    Graphics.ExecuteCommandBuffer(command);
                }
                image=new Texture2D(width,height,TextureFormat.RGB24,false);
                image.ReadPixels(new Rect(0,0,width,height),0,0); image.Apply();
                // Top-left pixel origin; projection describes the displayed image, including crop.
                var submission=new CameraSubmission { Jpeg=image.EncodeToJPG(90),Width=width,Height=height,
                    Fx=projection.m00*width/2.0,Fy=projection.m11*height/2.0,
                    Cx=(1-projection.m02)*width/2.0,Cy=(1+projection.m12)*height/2.0,TimestampMs=time };
                completion.TrySetResult(new CapturedCamera { Image=submission,TrackedPose=pose,Preview=image,ScreenOrientation=Screen.orientation }); image=null;
            }
            catch(OperationCanceledException) { completion.TrySetCanceled(); }
            catch(Exception error) { completion.TrySetException(error); }
            finally { RenderTexture.active=previous; if(rt!=null) RenderTexture.ReleaseTemporary(rt); if(image!=null) Destroy(image); }
        }
    }
}
