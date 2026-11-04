using NUnit.Framework;
using OpenArCloud.GeoPose.Unity;
using UnityEngine;

namespace OpenArCloud.GeoPose.Tests
{
    public class SceneTests
    {
        [Test]
        public void PositiveYawPointsForwardNorthAndRebasePreservesGeographicPose()
        {
            var go=new GameObject("test");
            try
            {
                var scene=go.AddComponent<GeoPoseScene>(); var pose=new BasicPose(new GeoPosition(60,10,100),Quaterniond.FromYpr(90,0,0));
                var anchor=scene.Place(null,pose);
                Assert.That(Vector3.Distance(anchor.transform.forward,Vector3.forward),Is.LessThan(1e-6));
                var ecef=anchor.EcefPose;
                scene.Rebase(scene.Frame.EnuToGeodetic(new Vector3d(.01,.02,.03)));
                Assert.That(Vector3.Distance(anchor.transform.localPosition,new Vector3(-.01f,-.03f,-.02f)),Is.LessThan(1e-6));
                Assert.That((anchor.EcefPose.Position-ecef.Position).Length,Is.LessThan(1e-9));
                var captured=scene.CaptureWorld(anchor.transform);
                Assert.That((Wgs84.ToEcef(captured.position)-ecef.Position).Length,Is.LessThan(1e-7));
            }
            finally {Object.DestroyImmediate(go);}
        }
        [Test]
        public void ArAlignmentMovesContentRootAndLeavesTrackedCameraAlone()
        {
            var root=new GameObject("geo"); var cameraGo=new GameObject("tracked");
            try
            {
                var scene=root.AddComponent<GeoPoseScene>(); var camera=cameraGo.AddComponent<Camera>();
                camera.transform.SetPositionAndRotation(new Vector3(2,1.5f,3),Quaternion.AngleAxis(30,Vector3.up));
                var before=camera.transform.WorldPose(); var geo=new BasicPose(new GeoPosition(60,10,101.5),Quaterniond.FromYpr(0,0,90));
                scene.AlignToCamera(geo,before);
                Assert.That((camera.transform.WorldPose().Position-before.Position).Length,Is.Zero);
                var recovered=scene.CaptureCamera(camera);
                Assert.That((Wgs84.ToEcef(recovered.position)-Wgs84.ToEcef(geo.position)).Length,Is.LessThan(1e-6));
                scene.RebasePreservingTracking(geo.position,camera);
                Assert.That((camera.transform.WorldPose().Position-before.Position).Length,Is.Zero);
            }
            finally {Object.DestroyImmediate(root);Object.DestroyImmediate(cameraGo);}
        }
        [Test]
        public void RejectsScaledFrameParents()
        {
            var go=new GameObject("test");
            try {go.transform.localScale=new Vector3(1,-1,1);Assert.Throws<System.InvalidOperationException>(()=>UnityConversions.RequireUnitScale(go.transform));}
            finally {Object.DestroyImmediate(go);}
        }
    }
}
