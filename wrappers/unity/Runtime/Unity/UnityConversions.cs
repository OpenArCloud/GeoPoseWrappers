using System;
using UnityEngine;

namespace OpenArCloud.GeoPose.Unity
{
    public static class UnityConversions
    {
        // Only call this on LOCAL coordinates. ECEF positions never belong in a Unity Vector3.
        public static Vector3 ToVector3(this Vector3d local)
        {
            Numbers.Finite(local.x); Numbers.Finite(local.y); Numbers.Finite(local.z);
            if(Math.Max(Math.Abs(local.x),Math.Max(Math.Abs(local.y),Math.Abs(local.z)))>float.MaxValue) throw new ArgumentOutOfRangeException(nameof(local));
            return new Vector3((float)local.x,(float)local.y,(float)local.z);
        }
        public static Vector3d ToDouble(this Vector3 v) => new Vector3d(v.x,v.y,v.z);
        public static Quaternion ToQuaternion(this Quaterniond value) { var q=value.Normalized; return new Quaternion((float)q.x,(float)q.y,(float)q.z,(float)q.w); }
        public static Quaterniond ToDouble(this Quaternion q) => new Quaterniond(q.x,q.y,q.z,q.w).Normalized;
        public static Pose3d WorldPose(this Transform t) => new Pose3d(t.position.ToDouble(),t.rotation.ToDouble());
        public static Pose3d LocalPose(this Transform t) => new Pose3d(t.localPosition.ToDouble(),t.localRotation.ToDouble());
        public static void SetLocalPose(this Transform t,Pose3d p) { t.localPosition=p.Position.ToVector3(); t.localRotation=p.Rotation.ToQuaternion(); }
        public static void SetWorldPose(this Transform t,Pose3d p) { t.SetPositionAndRotation(p.Position.ToVector3(),p.Rotation.ToQuaternion()); }
        public static void RequireUnitScale(Transform t)
        {
            for(var current=t;current!=null;current=current.parent)
                if((current.localScale-Vector3.one).sqrMagnitude>1e-10f) throw new InvalidOperationException("GeoPose frame/anchor ancestors must have positive unit scale. Scale a model child instead.");
        }
    }
}
