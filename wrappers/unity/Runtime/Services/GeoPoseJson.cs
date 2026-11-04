using System;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace OpenArCloud.GeoPose
{
    public static class GeoPoseJson
    {
        private static double Number(JToken obj,string key)
        {
            var t=obj?[key];
            if(t==null || (t.Type!=JTokenType.Float && t.Type!=JTokenType.Integer)) throw new FormatException("Missing numeric GeoPose field: "+key);
            return Numbers.Finite((double)t);
        }
        public static BasicPose Parse(string json) => Parse(JObject.Parse(json));
        public static BasicPose Parse(JToken value)
        {
            var p=value?["position"]; var position=new GeoPosition(Number(p,"lat"),Number(p,"lon"),Number(p,"h"));
            var q=value["quaternion"]; var a=value["angles"];
            if((q==null)==(a==null)) throw new FormatException("Expected exactly one of quaternion or angles.");
            return new BasicPose(position,q!=null ? new Quaterniond(Number(q,"x"),Number(q,"y"),Number(q,"z"),Number(q,"w")) :
                Quaterniond.FromYpr(Number(a,"yaw"),Number(a,"pitch"),Number(a,"roll")));
        }
        public static JObject ToObject(BasicPose pose,bool ypr=false)
        {
            pose.position.Validate(); var q=pose.quaternion.Normalized; var p=pose.position;
            var v=new JObject { ["position"]=new JObject { ["lat"]=p.lat,["lon"]=p.lon,["h"]=p.h } };
            if(ypr) { var a=q.ToYpr(); v["angles"]=new JObject { ["yaw"]=a.yaw,["pitch"]=a.pitch,["roll"]=a.roll }; }
            else v["quaternion"]=new JObject { ["x"]=q.x,["y"]=q.y,["z"]=q.z,["w"]=q.w };
            return v;
        }
        public static string Write(BasicPose pose,bool ypr=false) => ToObject(pose,ypr).ToString(Formatting.Indented);
    }
}
