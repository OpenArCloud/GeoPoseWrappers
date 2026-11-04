using System;
using UnityEngine;

namespace OpenArCloud.GeoPose.Unity
{
    [DisallowMultipleComponent]
    public sealed class GeoPoseAnchor : MonoBehaviour
    {
        public GeoPoseScene scene;
        public BodyAxes bodyAxes=BodyAxes.ForwardLeftUp;
        public BasicPose geoPose=new BasicPose(new GeoPosition(60,10,100),Quaterniond.Identity);
        [TextArea(3,12)] public string geoPoseJson;
        private GeoPoseScene registered;
        public Pose3d EcefPose => Wgs84.ToEcef(geoPose);
        private void OnEnable() { if(scene!=null) { Register(); Apply(); } }
        private void OnDisable() { if(registered!=null) registered.Unregister(this); registered=null; }
        private void Register()
        {
            if(registered==scene) return;
            if(registered!=null) registered.Unregister(this);
            scene.Register(this); registered=scene;
        }
        public void Set(GeoPoseScene reference,BasicPose pose,BodyAxes axes=BodyAxes.ForwardLeftUp)
        {
            scene=reference!=null?reference:throw new ArgumentNullException(nameof(reference));
            geoPose=new BasicPose(pose.position,pose.quaternion); bodyAxes=axes; Register(); Apply();
        }
        public void SetEcef(Pose3d ecef) => Set(scene,Wgs84.FromEcef(ecef),bodyAxes);
        [ContextMenu("GeoPose/Apply geographic pose")]
        public void Apply()
        {
            if(scene==null) throw new InvalidOperationException("Assign a GeoPoseScene.");
            if(transform.parent!=scene.transform) throw new InvalidOperationException("An anchor must be a direct child of its GeoPoseScene; attach imported meshes underneath it.");
            UnityConversions.RequireUnitScale(transform);
            var local=scene.Frame.GeoPoseToUnity(geoPose,bodyAxes);
            if(local.Position.Length>scene.localRangeWarningMetres) Debug.LogWarning("GeoPose anchor is far from the local origin; rebase for better float precision.",this);
            transform.SetLocalPose(local);
        }
        [ContextMenu("GeoPose/Capture Unity transform")]
        public void CaptureTransform() { geoPose=scene.CaptureWorld(transform,bodyAxes); geoPoseJson=GeoPoseJson.Write(geoPose); }
        [ContextMenu("GeoPose/Apply JSON (Quaternion or YPR)")]
        public void ApplyJson() { Set(scene,GeoPoseJson.Parse(geoPoseJson),bodyAxes); }
        [ContextMenu("GeoPose/Export Quaternion JSON")]
        public void ExportQuaternion() { geoPoseJson=GeoPoseJson.Write(geoPose); }
        [ContextMenu("GeoPose/Export YPR JSON")]
        public void ExportYpr() { geoPoseJson=GeoPoseJson.Write(geoPose,true); }
    }
}
