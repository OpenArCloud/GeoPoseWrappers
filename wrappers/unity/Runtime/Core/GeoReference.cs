using System;

namespace OpenArCloud.GeoPose
{
    public static class Wgs84
    {
        public const double A=6378137.0, F=1/298.257223563, E2=F*(2-F), B=A*(1-F);
        public static Vector3d ToEcef(GeoPosition p)
        {
            p.Validate(); double lat=p.lat*Numbers.Rad,lon=p.lon*Numbers.Rad,s=Math.Sin(lat),c=Math.Cos(lat),n=A/Math.Sqrt(1-E2*s*s);
            return new Vector3d((n+p.h)*c*Math.Cos(lon),(n+p.h)*c*Math.Sin(lon),(n*(1-E2)+p.h)*s);
        }
        // Intended for Earth-surface/near-Earth poses. Deep interior positions do not have a unique geodetic inverse.
        public static GeoPosition FromEcef(Vector3d p)
        {
            Numbers.Finite(p.x); Numbers.Finite(p.y); Numbers.Finite(p.z);
            double r=Math.Sqrt(p.x*p.x+p.y*p.y);
            if(p.Length<100000) throw new ArgumentException("Geodetic inverse is unsupported near Earth's centre.");
            if(r<1e-10) return new GeoPosition(p.z<0?-90:90,0,Math.Abs(p.z)-B);
            double lat=Math.Atan2(p.z,r*(1-E2));
            for(int i=0;i<20;i++) { double s=Math.Sin(lat),n=A/Math.Sqrt(1-E2*s*s),next=Math.Atan2(p.z+E2*n*s,r); if(Math.Abs(next-lat)<1e-15) {lat=next;break;} lat=next; }
            double sl=Math.Sin(lat),cl=Math.Cos(lat),nn=A/Math.Sqrt(1-E2*sl*sl);
            double h=Math.Abs(cl)>0.5?r/cl-nn:p.z/sl-nn*(1-E2);
            return new GeoPosition(lat/Numbers.Rad,Math.Atan2(p.y,p.x)/Numbers.Rad,h);
        }
        public static Matrix3d EnuToEcef(GeoPosition p)
        {
            p.Validate(); double a=p.lat*Numbers.Rad,b=p.lon*Numbers.Rad,sa=Math.Sin(a),ca=Math.Cos(a),sb=Math.Sin(b),cb=Math.Cos(b);
            return new Matrix3d(new Vector3d(-sb,cb,0),new Vector3d(-sa*cb,-sa*sb,ca),new Vector3d(ca*cb,ca*sb,sa));
        }
        public static Pose3d ToEcef(BasicPose p) => new Pose3d(ToEcef(p.position),Quaterniond.FromMatrix(EnuToEcef(p.position)*p.quaternion.Matrix));
        public static BasicPose FromEcef(Pose3d p)
        {
            var position=FromEcef(p.Position);
            return new BasicPose(position,Quaterniond.FromMatrix(EnuToEcef(position).Transpose*p.Rotation.Matrix));
        }
    }

    public enum BodyAxes
    {
        ForwardLeftUp,       // GeoPose +X forward,+Y left,+Z up; Unity +Z forward,+X right,+Y up.
        CameraRightUpBack,   // GeoPose +X right,+Y up,-Z view; Unity +Z view.
        GltfSourceXReflection, // Raw glTF body frame, already imported by glTFast >=4 (X reflection).
        EnuAxes             // Pure basis conversion: Unity local (x,y,z) means GeoPose body (x,z,y).
    }
    public static class UnityBasis
    {
        public static Matrix3d EnuToUnity => new Matrix3d(new Vector3d(1,0,0),new Vector3d(0,0,1),new Vector3d(0,1,0));
        public static Vector3d FromEnu(Vector3d enu) => EnuToUnity*enu;
        public static Vector3d ToEnu(Vector3d unity) => EnuToUnity*unity;
        public static Matrix3d UnityBodyToGeoBody(BodyAxes axes)
        {
            switch(axes)
            {
                case BodyAxes.ForwardLeftUp: return new Matrix3d(new Vector3d(0,-1,0),new Vector3d(0,0,1),new Vector3d(1,0,0));
                case BodyAxes.CameraRightUpBack: return new Matrix3d(new Vector3d(1,0,0),new Vector3d(0,1,0),new Vector3d(0,0,-1));
                case BodyAxes.GltfSourceXReflection: return new Matrix3d(new Vector3d(-1,0,0),new Vector3d(0,1,0),new Vector3d(0,0,1));
                case BodyAxes.EnuAxes: return EnuToUnity;
                default: throw new ArgumentOutOfRangeException(nameof(axes));
            }
        }
    }

    // Immutable scene origin. Both ECEF subtraction and tangent-frame rotation happen in double precision.
    public sealed class GeoReference
    {
        public GeoPosition Origin { get; }
        public Vector3d OriginEcef { get; }
        public Matrix3d EnuToEcef { get; }
        public GeoReference(GeoPosition origin) { origin.Validate(); Origin=origin; OriginEcef=Wgs84.ToEcef(origin); EnuToEcef=Wgs84.EnuToEcef(origin); }
        public Vector3d EcefToEnu(Vector3d ecef) => EnuToEcef.Transpose*(ecef-OriginEcef);
        public Vector3d EnuToEcefPosition(Vector3d enu) => OriginEcef+EnuToEcef*enu;
        public Vector3d GeodeticToEnu(GeoPosition p) => EcefToEnu(Wgs84.ToEcef(p));
        public GeoPosition EnuToGeodetic(Vector3d enu) => Wgs84.FromEcef(EnuToEcefPosition(enu));
        public Vector3d EcefToUnity(Vector3d ecef) => UnityBasis.FromEnu(EcefToEnu(ecef));
        public Vector3d UnityToEcef(Vector3d unity) => EnuToEcefPosition(UnityBasis.ToEnu(unity));
        public Vector3d GeodeticToUnity(GeoPosition p) => EcefToUnity(Wgs84.ToEcef(p));
        public GeoPosition UnityToGeodetic(Vector3d unity) => Wgs84.FromEcef(UnityToEcef(unity));
        public Pose3d EcefToUnity(Pose3d pose,BodyAxes axes) => new Pose3d(EcefToUnity(pose.Position),
            Quaterniond.FromMatrix(UnityBasis.EnuToUnity*EnuToEcef.Transpose*pose.Rotation.Matrix*UnityBasis.UnityBodyToGeoBody(axes)));
        public Pose3d UnityToEcef(Pose3d pose,BodyAxes axes) => new Pose3d(UnityToEcef(pose.Position),
            Quaterniond.FromMatrix(EnuToEcef*UnityBasis.EnuToUnity*pose.Rotation.Matrix*UnityBasis.UnityBodyToGeoBody(axes).Transpose));
        public Pose3d GeoPoseToUnity(BasicPose pose,BodyAxes axes=BodyAxes.ForwardLeftUp) => EcefToUnity(Wgs84.ToEcef(pose),axes);
        public BasicPose UnityToGeoPose(Pose3d pose,BodyAxes axes=BodyAxes.ForwardLeftUp) => Wgs84.FromEcef(UnityToEcef(pose,axes));
        // Camera pose and tracked pose must belong to the SAME captured image, in the same tracking world.
        public Pose3d AlignToCapturedCamera(BasicPose cameraGeoPose,Pose3d trackedCameraAtCapture) =>
            trackedCameraAtCapture*GeoPoseToUnity(cameraGeoPose,BodyAxes.CameraRightUpBack).Inverse;
    }
}
