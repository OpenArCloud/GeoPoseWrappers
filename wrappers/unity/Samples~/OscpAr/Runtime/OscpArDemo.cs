using System;
using System.Collections.Generic;
using System.Net.Http;
using System.Threading;
using System.Threading.Tasks;
using OpenArCloud.GeoPose.Unity;
using UnityEngine;
using UnityEngine.XR.ARFoundation;
using UnityEngine.XR.ARSubsystems;

namespace OpenArCloud.GeoPose.Samples
{
    public sealed class OscpArDemo : MonoBehaviour
    {
        public TextAsset configuration;
        public GeoPoseScene geographicScene;
        public ArBackgroundCapture capture;
        public ARPlaneManager planeManager;
        [Tooltip("Approximate camera height above the desired placement plane, not a ground measurement.")]
        public double eyeHeightMetres=1.5;
        public bool useDetectedSurface=true;
        public IAccessTokenProvider TokenProvider { get; set; } // inject your authenticated mobile token provider before Start
        private DemoConfig config;
        private HttpClient http;
        private OscpClient client;
        private CancellationTokenSource lifetime;
        private CapturedCamera captured;
        private bool busy,localized,assetsLoaded;
        private int trackingRevision,capturedRevision;
        private double capturedFloorDistance;
        private readonly RuntimeTokens runtimeTokens=new RuntimeTokens();
        private string pastedVpsToken="",pastedCdsToken="";
        private string status="Capture a preview, then choose Localize to send it to the selected endpoint.";
        private readonly List<GameObject> placed=new List<GameObject>();
        private void OnEnable() { ARSession.stateChanged+=OnTrackingChanged; }
        private void OnDisable() { ARSession.stateChanged-=OnTrackingChanged; }
        private void OnTrackingChanged(ARSessionStateChangedEventArgs state)
        {
            if(state.state!=ARSessionState.SessionTracking)
            {
                trackingRevision++;
                if(localized) { geographicScene.gameObject.SetActive(false); status="Tracking changed. Capture and localize again to restore geographic alignment."; }
            }
        }
        private void Start()
        {
            try
            {
                config=DemoConfig.Parse(configuration.text); config.Selected().RequestUri();
                http=new HttpClient(new HttpClientHandler { AllowAutoRedirect=false }) { Timeout=TimeSpan.FromSeconds(40) };
                lifetime=new CancellationTokenSource(); client=new OscpClient(http,TokenProvider??runtimeTokens);
                if(config.includeLocationHint) Input.location.Start();
            }
            catch(Exception e) { status=e.Message; enabled=false; }
        }
        private async void CapturePreview()
        {
            if(busy) return; busy=true;
            try
            {
                ClearCapture(); capturedRevision=trackingRevision;
                captured=await capture.Capture(config.imageLongEdge,lifetime.Token);
                capturedFloorDistance=FloorBelowCamera(captured.TrackedPose.Position.ToVector3());
                status="Check that the preview is upright and text is not mirrored. Initial origin drop: "+capturedFloorDistance.ToString("F2")+" m. Localize sends this image to "+config.Selected().id+".";
            }
            catch(Exception e) { status=e.Message; }
            finally { busy=false; }
        }
        private async void Localize()
        {
            if(busy || captured==null) return; busy=true;
            try
            {
                if(ARSession.state!=ARSessionState.SessionTracking || capturedRevision!=trackingRevision) throw new InvalidOperationException("AR tracking was lost. Capture a new image.");
                if(captured.ScreenOrientation!=Screen.orientation) throw new InvalidOperationException("Screen orientation changed. Capture a new image.");
                if(DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()-captured.Image.TimestampMs>30000) throw new InvalidOperationException("Preview is more than 30 seconds old. Capture again.");
                if(config.includeLocationHint && Input.location.status==LocationServiceStatus.Running)
                {
                    var fix=Input.location.lastData;
                    captured.Image.LocationHint=new GeoPosition(fix.latitude,fix.longitude,fix.altitude);
                }
                status="Localizing with "+config.Selected().id+"…";
                var endpoint=config.Selected();
                var pose=CameraConventions.ToRightUpBack(await client.Localize(endpoint,captured.Image,lifetime.Token),endpoint.cameraAxes);
                lifetime.Token.ThrowIfCancellationRequested();
                if(ARSession.state!=ARSessionState.SessionTracking || capturedRevision!=trackingRevision || captured.ScreenOrientation!=Screen.orientation) throw new InvalidOperationException("Tracking or screen orientation changed during localization. Capture again.");
                if(!localized) geographicScene.Rebase(new GeoPosition(pose.position.lat,pose.position.lon,pose.position.h-capturedFloorDistance));
                geographicScene.AlignToCamera(pose,captured.TrackedPose);
                geographicScene.gameObject.SetActive(true); localized=true;
                if(!assetsLoaded)
                {
                    ClearPlaced();
                    await PlaceBundled(pose,lifetime.Token);
                    if(config.discovery.enabled) await PlaceDiscovered(pose,lifetime.Token);
                    assetsLoaded=true;
                }
                if(capturedRevision!=trackingRevision) throw new InvalidOperationException("Tracking changed while loading content. Localize again.");
                status="Localized. "+placed.Count+" assets anchored in the shared ENU frame.";
                ClearCapture();
            }
            catch(OperationCanceledException) { status="Localization cancelled. Capture again."; }
            catch(Exception e) { status=e.Message; }
            finally { busy=false; }
        }
        private double FloorBelowCamera(Vector3 cameraPosition)
        {
            double nearest=double.PositiveInfinity;
            if(useDetectedSurface && planeManager!=null) foreach(var plane in planeManager.trackables)
            {
                if(plane.trackingState!=TrackingState.Tracking || plane.alignment!=PlaneAlignment.HorizontalUp || Vector3.Dot(plane.transform.up,Vector3.up)<0.98f) continue;
                var surface=new Plane(plane.transform.up,plane.transform.position);
                if(!surface.Raycast(new Ray(cameraPosition,Vector3.down),out float distance) || distance<0.3f || distance>3f) continue;
                var hit=plane.transform.InverseTransformPoint(cameraPosition+Vector3.down*distance);
                var boundary=plane.boundary; bool inside=false;
                for(int i=0,j=boundary.Length-1;i<boundary.Length;j=i++)
                {
                    var a=boundary[i]; var b=boundary[j];
                    if((a.y>hit.z)!=(b.y>hit.z) && hit.x<(b.x-a.x)*(hit.z-a.y)/(b.y-a.y)+a.x) inside=!inside;
                }
                if(inside) nearest=Math.Min(nearest,distance);
            }
            // A horizontal plane may be a table. The preview/status exposes this estimate; production apps can choose a classified floor.
            double result=double.IsInfinity(nearest)?eyeHeightMetres:nearest;
            if(result<0 || result>3 || double.IsNaN(result)) throw new ArgumentException("Fallback eye height must be between 0 and 3 metres.");
            return result;
        }
        private async Task AddAsset(string name,string uri,BasicPose pose,BodyAxes axes,CancellationToken ct)
        {
            var anchor=geographicScene.Place(null,pose,axes); anchor.name=name;
            try { await anchor.gameObject.AddComponent<GlbAsset>().Load(uri,ct); ct.ThrowIfCancellationRequested(); placed.Add(anchor.gameObject); }
            catch { if(anchor!=null) Destroy(anchor.gameObject); throw; }
        }
        private async Task PlaceBundled(BasicPose camera,CancellationToken ct)
        {
            var forward=camera.quaternion.Rotate(new Vector3d(0,0,-1));
            forward=new Vector3d(forward.x,forward.y,0);
            if(forward.Length<0.1) forward=new Vector3d(0,1,0); else forward=forward.Normalized;
            var right=new Vector3d(forward.y,-forward.x,0);
            var local=new GeoReference(camera.position);
            double yaw=Math.Atan2(forward.y,forward.x)/Numbers.Rad;
            string root=Application.streamingAssetsPath.TrimEnd('/')+"/GeoPoseDemo/";
            if(!root.Contains("://") && !root.StartsWith("jar:")) root=new Uri(root).AbsoluteUri;
            for(int i=0;i<3;i++)
            {
                var enu=forward*(3+i)+right*((i-1)*1.5)+new Vector3d(0,0,-capturedFloorDistance);
                var pose=new BasicPose(local.EnuToGeodetic(enu),Quaterniond.FromYpr(yaw,0,0));
                await AddAsset("Nearby GLB "+i,root+(i==1?"arrow.glb":"marker.glb"),pose,BodyAxes.ForwardLeftUp,ct);
            }
        }
        private async Task PlaceDiscovered(BasicPose camera,CancellationToken ct)
        {
            foreach(var asset in await client.Discover(config.discovery,camera.position,ct))
            {
                await AddAsset(asset.Title,asset.Url.AbsoluteUri,asset.Pose,config.discovery.bodyAxes,ct);
            }
        }
        private void ClearCapture() { if(captured?.Preview!=null) Destroy(captured.Preview); captured=null; }
        private void ClearPlaced() { foreach(var go in placed) if(go!=null) Destroy(go); placed.Clear(); }
        private void OnDestroy() { lifetime?.Cancel(); lifetime?.Dispose(); http?.Dispose(); ClearCapture(); ClearPlaced(); if(config?.includeLocationHint==true) Input.location.Stop(); }
        private void OnGUI()
        {
            if(config==null) { GUI.Label(new Rect(20,20,800,100),status); return; }
            float factor=Mathf.Max(1,Screen.width/600f); var old=GUI.matrix; GUI.matrix=Matrix4x4.Scale(Vector3.one*factor);
            GUILayout.BeginArea(new Rect(15,20,Screen.width/factor-30,Screen.height/factor-40),GUI.skin.box);
            GUILayout.Label("OSCP GeoPose AR · "+config.selectedEndpoint); GUILayout.Label(status);
            GUI.enabled=!busy;
            foreach(var endpoint in config.endpoints)
                if(GUILayout.Toggle(config.selectedEndpoint==endpoint.id,endpoint.id) && config.selectedEndpoint!=endpoint.id) {config.selectedEndpoint=endpoint.id;pastedVpsToken="";ClearCapture();}
            if(TokenProvider==null)
            {
                GUILayout.Label("Optional short-lived VPS bearer token (memory only; environment fallback)");
                pastedVpsToken=GUILayout.PasswordField(pastedVpsToken,'*'); runtimeTokens.Set(config.Selected().bearerTokenEnvironment,pastedVpsToken);
                if(config.discovery.enabled) { GUILayout.Label("Optional CDS bearer token (separate credential)"); pastedCdsToken=GUILayout.PasswordField(pastedCdsToken,'*'); runtimeTokens.Set(config.discovery.bearerTokenEnvironment,pastedCdsToken); }
            }
            useDetectedSurface=GUILayout.Toggle(useDetectedSurface,"Use horizontal surface beneath camera for initial origin");
            if(GUILayout.Button("Capture preview",GUILayout.Height(40))) CapturePreview();
            if(captured!=null)
            {
                GUILayout.Label(captured.Preview,GUILayout.Width(240),GUILayout.Height(240f*captured.Preview.height/captured.Preview.width));
                if(GUILayout.Button("Localize — send preview image",GUILayout.Height(40))) Localize();
            }
            if(localized && GUILayout.Button("Rebase near current camera"))
            { var cameraGeo=geographicScene.CaptureCamera(capture.arCamera); geographicScene.RebasePreservingTracking(cameraGeo.position,capture.arCamera); }
            GUI.enabled=true; GUILayout.EndArea(); GUI.matrix=old;
        }
    }
}
