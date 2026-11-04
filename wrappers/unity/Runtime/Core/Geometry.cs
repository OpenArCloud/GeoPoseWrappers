using System;

namespace OpenArCloud.GeoPose
{
    public static class Numbers
    {
        public const double Rad = Math.PI / 180.0;
        public static double Finite(double v)
        {
            if (double.IsNaN(v) || double.IsInfinity(v)) throw new ArgumentException("Expected a finite number.");
            return v;
        }
        public static double Clamp(double x, double lo, double hi) => Math.Max(lo, Math.Min(hi, x));
        public static double WrapDegrees(double x) => (x % 360 + 540) % 360 - 180;
    }

    [Serializable]
    public struct Vector3d
    {
        public double x, y, z;
        public Vector3d(double x, double y, double z) { this.x = Numbers.Finite(x); this.y = Numbers.Finite(y); this.z = Numbers.Finite(z); }
        public double Length => Math.Sqrt(x*x + y*y + z*z);
        public Vector3d Normalized => Length > 0 ? this / Length : throw new ArgumentException("Zero vector.");
        public static Vector3d operator +(Vector3d a, Vector3d b) => new Vector3d(a.x+b.x,a.y+b.y,a.z+b.z);
        public static Vector3d operator -(Vector3d a, Vector3d b) => new Vector3d(a.x-b.x,a.y-b.y,a.z-b.z);
        public static Vector3d operator *(Vector3d a, double s) => new Vector3d(a.x*s,a.y*s,a.z*s);
        public static Vector3d operator /(Vector3d a, double s) => a * (1/s);
        public static double Dot(Vector3d a, Vector3d b) => a.x*b.x+a.y*b.y+a.z*b.z;
        public static Vector3d Cross(Vector3d a, Vector3d b) => new Vector3d(a.y*b.z-a.z*b.y,a.z*b.x-a.x*b.z,a.x*b.y-a.y*b.x);
    }

    // Column vectors; A*B applies B first. Matrices can also represent reflections.
    public struct Matrix3d
    {
        public readonly Vector3d X, Y, Z;
        public Matrix3d(Vector3d x, Vector3d y, Vector3d z) { X=x; Y=y; Z=z; }
        public static Matrix3d Identity => new Matrix3d(new Vector3d(1,0,0),new Vector3d(0,1,0),new Vector3d(0,0,1));
        public Matrix3d Transpose => new Matrix3d(new Vector3d(X.x,Y.x,Z.x),new Vector3d(X.y,Y.y,Z.y),new Vector3d(X.z,Y.z,Z.z));
        public double Determinant => Vector3d.Dot(X,Vector3d.Cross(Y,Z));
        public static Vector3d operator *(Matrix3d m, Vector3d v) => m.X*v.x+m.Y*v.y+m.Z*v.z;
        public static Matrix3d operator *(Matrix3d a, Matrix3d b) => new Matrix3d(a*b.X,a*b.Y,a*b.Z);
    }

    [Serializable]
    public struct Quaterniond
    {
        public double x, y, z, w;
        public Quaterniond(double x, double y, double z, double w) { this.x=x; this.y=y; this.z=z; this.w=w; }
        public static Quaterniond Identity => new Quaterniond(0,0,0,1);
        public Quaterniond Normalized
        {
            get
            {
                double m=Math.Max(Math.Max(Math.Abs(Numbers.Finite(x)),Math.Abs(Numbers.Finite(y))),Math.Max(Math.Abs(Numbers.Finite(z)),Math.Abs(Numbers.Finite(w))));
                if (m==0) throw new ArgumentException("Quaternion must be nonzero.");
                double a=x/m,b=y/m,c=z/m,d=w/m,n=Math.Sqrt(a*a+b*b+c*c+d*d);
                return new Quaterniond(a/n,b/n,c/n,d/n);
            }
        }
        public Quaterniond Inverse { get { var q=Normalized; return new Quaterniond(-q.x,-q.y,-q.z,q.w); } }
        public static Quaterniond operator *(Quaterniond a, Quaterniond b) => new Quaterniond(
            a.w*b.x+a.x*b.w+a.y*b.z-a.z*b.y,
            a.w*b.y-a.x*b.z+a.y*b.w+a.z*b.x,
            a.w*b.z+a.x*b.y-a.y*b.x+a.z*b.w,
            a.w*b.w-a.x*b.x-a.y*b.y-a.z*b.z);
        public Vector3d Rotate(Vector3d v) => Matrix*v;
        public Matrix3d Matrix
        {
            get
            {
                var q=Normalized; double a=q.x,b=q.y,c=q.z,d=q.w;
                return new Matrix3d(new Vector3d(1-2*(b*b+c*c),2*(a*b+d*c),2*(a*c-d*b)),
                    new Vector3d(2*(a*b-d*c),1-2*(a*a+c*c),2*(b*c+d*a)),
                    new Vector3d(2*(a*c+d*b),2*(b*c-d*a),1-2*(a*a+b*b)));
            }
        }
        public static Quaterniond FromMatrix(Matrix3d m)
        {
            if (Math.Abs(m.Determinant-1)>1e-8 || Math.Abs(m.X.Length-1)>1e-8 || Math.Abs(m.Y.Length-1)>1e-8 || Math.Abs(m.Z.Length-1)>1e-8)
                throw new ArgumentException("Quaternion requires a proper orthonormal rotation, not a reflection.");
            double t=m.X.x+m.Y.y+m.Z.z, s;
            Quaterniond q;
            if(t>0) { s=2*Math.Sqrt(t+1); q=new Quaterniond((m.Y.z-m.Z.y)/s,(m.Z.x-m.X.z)/s,(m.X.y-m.Y.x)/s,s/4); }
            else if(m.X.x>m.Y.y && m.X.x>m.Z.z) { s=2*Math.Sqrt(1+m.X.x-m.Y.y-m.Z.z); q=new Quaterniond(s/4,(m.Y.x+m.X.y)/s,(m.Z.x+m.X.z)/s,(m.Y.z-m.Z.y)/s); }
            else if(m.Y.y>m.Z.z) { s=2*Math.Sqrt(1+m.Y.y-m.X.x-m.Z.z); q=new Quaterniond((m.Y.x+m.X.y)/s,s/4,(m.Z.y+m.Y.z)/s,(m.Z.x-m.X.z)/s); }
            else { s=2*Math.Sqrt(1+m.Z.z-m.X.x-m.Y.y); q=new Quaterniond((m.Z.x+m.X.z)/s,(m.Z.y+m.Y.z)/s,s/4,(m.X.y-m.Y.x)/s); }
            return q.Normalized;
        }
        public static Quaterniond FromYpr(double yaw, double pitch, double roll)
        {
            double a=Numbers.Finite(yaw)*Numbers.Rad/2,b=Numbers.Finite(pitch)*Numbers.Rad/2,c=Numbers.Finite(roll)*Numbers.Rad/2;
            return (new Quaterniond(0,0,Math.Sin(a),Math.Cos(a))*new Quaterniond(0,Math.Sin(b),0,Math.Cos(b))*new Quaterniond(Math.Sin(c),0,0,Math.Cos(c))).Normalized;
        }
        public Ypr ToYpr()
        {
            var q=Normalized;
            double p=Numbers.Clamp(2*(q.w*q.y-q.z*q.x),-1,1);
            if(1-Math.Abs(p)<=1e-12) return new Ypr(Numbers.WrapDegrees(2*Math.Atan2(q.z,q.w)/Numbers.Rad),p<0?-90:90,0);
            return new Ypr(Numbers.WrapDegrees(Math.Atan2(2*(q.w*q.z+q.x*q.y),1-2*(q.y*q.y+q.z*q.z))/Numbers.Rad),
                Math.Asin(p)/Numbers.Rad,Numbers.WrapDegrees(Math.Atan2(2*(q.w*q.x+q.y*q.z),1-2*(q.x*q.x+q.y*q.y))/Numbers.Rad));
        }
    }

    [Serializable] public struct Ypr
    {
        public double yaw,pitch,roll;
        public Ypr(double yaw,double pitch,double roll) { this.yaw=yaw; this.pitch=pitch; this.roll=roll; }
        public Quaterniond Quaternion => Quaterniond.FromYpr(yaw,pitch,roll);
    }
    [Serializable] public struct GeoPosition
    {
        public double lat,lon,h;
        public GeoPosition(double lat,double lon,double h) { this.lat=lat; this.lon=lon; this.h=h; Validate(); }
        public void Validate()
        {
            Numbers.Finite(lat); Numbers.Finite(lon); Numbers.Finite(h);
            if(Math.Abs(lat)>90 || Math.Abs(lon)>180) throw new ArgumentException("Latitude/longitude outside [-90,90]/[-180,180].");
        }
    }
    [Serializable] public struct BasicPose
    {
        public GeoPosition position;
        public Quaterniond quaternion;
        public BasicPose(GeoPosition position,Quaterniond quaternion) { position.Validate(); this.position=position; this.quaternion=quaternion.Normalized; }
        public BasicYprPose ToYpr() => new BasicYprPose { position=position,angles=quaternion.ToYpr() };
    }
    [Serializable] public struct BasicYprPose
    {
        public GeoPosition position;
        public Ypr angles;
        public BasicPose ToQuaternion() => new BasicPose(position,angles.Quaternion);
    }
    public struct Pose3d
    {
        public readonly Vector3d Position;
        public readonly Quaterniond Rotation;
        public Pose3d(Vector3d position,Quaterniond rotation) { Position=position; Rotation=rotation.Normalized; }
        public Pose3d Inverse => new Pose3d(Rotation.Inverse.Rotate(Position)*-1,Rotation.Inverse);
        public static Pose3d operator *(Pose3d a,Pose3d b) => new Pose3d(a.Position+a.Rotation.Rotate(b.Position),a.Rotation*b.Rotation);
    }
}
