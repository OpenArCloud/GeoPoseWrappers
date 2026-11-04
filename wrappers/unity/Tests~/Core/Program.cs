using System;
using System.IO;
using System.Net;
using System.Net.Http;
using System.Threading;
using System.Threading.Tasks;
using Newtonsoft.Json.Linq;
using OpenArCloud.GeoPose;

static class Program
{
    static int checks;
    static void Check(bool ok,string name) { checks++; if(!ok) throw new Exception(name); }
    static void Near(double a,double b,double tolerance=1e-8) => Check(Math.Abs(a-b)<tolerance,$"{a} != {b} (tol {tolerance})");
    static void Vec(Vector3d a,Vector3d b,double tol=1e-8) { Near(a.x,b.x,tol);Near(a.y,b.y,tol);Near(a.z,b.z,tol); }
    static void Rot(Quaterniond a,Quaterniond b,double tol=1e-8) { Vec(a.Matrix.X,b.Matrix.X,tol);Vec(a.Matrix.Y,b.Matrix.Y,tol);Vec(a.Matrix.Z,b.Matrix.Z,tol); }
    static void Throws(Action action) { bool threw=false;try {action();}catch(ArgumentException){threw=true;}catch(FormatException){threw=true;}Check(threw,"Expected validation error"); }
    static Vector3d Read(JToken t) => new Vector3d((double)t[0],(double)t[1],(double)t[2]);
    static async Task Main()
    {
        // Canonical explainer poses: both JSON encodings and all three rotated axes.
        var fixture=JObject.Parse(File.ReadAllText(Path.Combine(AppContext.BaseDirectory,"enu-rotation-poses.json")));
        foreach(var sequence in fixture["sequences"]) foreach(var pose in sequence["poses"])
        {
            var a=GeoPoseJson.Parse(pose["basicYPR"]); var b=GeoPoseJson.Parse(pose["basicQuaternion"]);
            Rot(a.quaternion,b.quaternion); Rot(a.quaternion,a.ToYpr().ToQuaternion().quaternion);
            Vec(a.quaternion.Matrix.X,Read(pose["axesInENU"]["x"]));
            Vec(a.quaternion.Matrix.Y,Read(pose["axesInENU"]["y"]));
            Vec(a.quaternion.Matrix.Z,Read(pose["axesInENU"]["z"]));
            Rot(GeoPoseJson.Parse(GeoPoseJson.Write(a,true)).quaternion,b.quaternion);
        }
        Vec(Wgs84.ToEcef(new GeoPosition(0,0,0)),new Vector3d(Wgs84.A,0,0));
        Vec(Wgs84.ToEcef(new GeoPosition(0,90,0)),new Vector3d(0,Wgs84.A,0));
        Near(Wgs84.FromEcef(new Vector3d(0,0,Wgs84.B+3)).h,3);
        Near(Wgs84.FromEcef(new Vector3d(0,0,-Wgs84.B-3)).lat,-90);
        var reference=new GeoReference(new GeoPosition(60,10,100));
        Vec(reference.EcefToEnu(reference.OriginEcef),new Vector3d(0,0,0));
        Vec(reference.EnuToEcef.X,new Vector3d(-Math.Sin(10*Numbers.Rad),Math.Cos(10*Numbers.Rad),0));
        // A float ECEF representation loses this centimetre-scale displacement; the double subtraction must not.
        var offset=new Vector3d(0.01,-0.02,0.03);
        Vec(reference.EcefToEnu(reference.EnuToEcefPosition(offset)),offset,2e-9);
        Vec(reference.EcefToUnity(reference.EnuToEcefPosition(offset)),new Vector3d(.01,.03,-.02),2e-9);
        var originPose=new BasicPose(reference.Origin,Quaterniond.Identity);
        var forward=reference.GeoPoseToUnity(originPose,BodyAxes.ForwardLeftUp);
        Vec(forward.Rotation.Rotate(new Vector3d(0,0,1)),new Vector3d(1,0,0));
        Vec(forward.Rotation.Rotate(new Vector3d(0,1,0)),new Vector3d(0,1,0));
        var yaw90=new BasicPose(reference.Origin,Quaterniond.FromYpr(90,0,0));
        Vec(reference.GeoPoseToUnity(yaw90).Rotation.Rotate(new Vector3d(0,0,1)),new Vector3d(0,0,1));
        // A level north-facing camera is roll +90 in this RIGHT/UP/BACK body convention.
        var camera=new BasicPose(reference.Origin,Quaterniond.FromYpr(0,0,90));
        Rot(reference.GeoPoseToUnity(camera,BodyAxes.CameraRightUpBack).Rotation,Quaterniond.Identity);
        Vec(reference.GeoPoseToUnity(originPose,BodyAxes.CameraRightUpBack).Rotation.Rotate(new Vector3d(0,0,1)),new Vector3d(0,-1,0));
        Vec(CameraConventions.ToRightUpBack(originPose,CameraAxes.RightDownForward).quaternion.Rotate(new Vector3d(0,0,-1)),new Vector3d(0,0,1));
        Vec(CameraConventions.ToRightUpBack(originPose,CameraAxes.ForwardLeftUp).quaternion.Rotate(new Vector3d(0,0,-1)),new Vector3d(1,0,0));
        foreach(BodyAxes axes in Enum.GetValues(typeof(BodyAxes))) Near(UnityBasis.UnityBodyToGeoBody(axes).Determinant,-1);
        // Explicit glTF source +Z vector, after glTFast X reflection, follows the original GeoPose +Z axis.
        Vec(reference.GeoPoseToUnity(originPose,BodyAxes.GltfSourceXReflection).Rotation.Rotate(new Vector3d(0,0,1)),new Vector3d(0,1,0));
        var random=new Random(753);
        for(int i=0;i<300;i++)
        {
            var geo=new GeoPosition(random.NextDouble()*179.8-89.9,random.NextDouble()*360-180,random.NextDouble()*10000-300);
            var back=Wgs84.FromEcef(Wgs84.ToEcef(geo));
            Near(back.lat,geo.lat,1e-10);Near(back.lon,geo.lon,1e-10);Near(back.h,geo.h,1e-7);
            var q=Quaterniond.FromYpr(random.NextDouble()*360-180,random.NextDouble()*178-89,random.NextDouble()*360-180);
            Rot(q,Quaterniond.FromMatrix(q.Matrix)); Rot(q,q.ToYpr().Quaternion);
            var pose=new BasicPose(geo,q);
            var ecef=Wgs84.ToEcef(pose);
            foreach(BodyAxes axes in Enum.GetValues(typeof(BodyAxes)))
            {
                var unity=reference.GeoPoseToUnity(pose,axes); var roundtrip=reference.UnityToGeoPose(unity,axes);
                Vec(Wgs84.ToEcef(roundtrip.position),ecef.Position,1e-7);Rot(roundtrip.quaternion,q);
                var ecef2=reference.UnityToEcef(reference.EcefToUnity(ecef,axes),axes);
                Vec(ecef2.Position,ecef.Position,1e-7);Rot(ecef2.Rotation,ecef.Rotation);
            }
        }
        foreach(double pitch in new[]{-90.0,90.0}) foreach(double yaw in new[]{-160.0,0.0,130.0})
        { var q=Quaterniond.FromYpr(yaw,pitch,70);Rot(q,q.ToYpr().Quaternion);Near(q.ToYpr().roll,0); }
        Rot(new Quaterniond(1e300,2e300,-3e300,4e300),new Quaterniond(1,2,-3,4));
        Throws(()=>new Quaterniond().ToYpr());Throws(()=>new Quaterniond(double.NaN,0,0,1).ToYpr());
        Throws(()=>Wgs84.ToEcef(new GeoPosition {lat=91}));Throws(()=>Wgs84.FromEcef(new Vector3d(0,0,0)));
        Throws(()=>Quaterniond.FromMatrix(UnityBasis.EnuToUnity));
        Throws(()=>GeoPoseJson.Parse("{\"position\":{\"lat\":0,\"lon\":0,\"h\":0},\"quaternion\":{\"w\":1}}"));
        // Align using the captured pose; camera motion while the HTTP request is pending is not applied retroactively.
        var captured=new Pose3d(new Vector3d(1,1.5,2),Quaterniond.FromYpr(25,10,-5));
        var groundFrame=new GeoReference(new GeoPosition(camera.position.lat,camera.position.lon,camera.position.h-1.5));
        Near(groundFrame.GeoPoseToUnity(camera,BodyAxes.CameraRightUpBack).Position.y,1.5,1e-8);
        var alignment=groundFrame.AlignToCapturedCamera(camera,captured);
        var mapped=alignment*groundFrame.GeoPoseToUnity(camera,BodyAxes.CameraRightUpBack);
        Vec(mapped.Position,captured.Position);Rot(mapped.Rotation,captured.Rotation);
        var moved=new Pose3d(captured.Position+new Vector3d(2,0,0),captured.Rotation);
        Check((alignment*groundFrame.GeoPoseToUnity(camera,BodyAxes.CameraRightUpBack)).Position.x!=moved.Position.x,"Do not substitute current camera pose");
        var rebased=new GeoReference(reference.EnuToGeodetic(new Vector3d(4000,5000,0)));
        var oldLocal=reference.GeoPoseToUnity(camera,BodyAxes.CameraRightUpBack);
        var newLocal=rebased.EcefToUnity(reference.UnityToEcef(oldLocal,BodyAxes.CameraRightUpBack),BodyAxes.CameraRightUpBack);
        Rot(rebased.UnityToGeoPose(newLocal,BodyAxes.CameraRightUpBack).quaternion,camera.quaternion);
        Vec(Wgs84.ToEcef(rebased.UnityToGeoPose(newLocal,BodyAxes.CameraRightUpBack).position),reference.OriginEcef,1e-7);
        await ProtocolTests();
        Console.WriteLine($"Passed {checks} assertions against actual Unity wrapper core/services sources.");
    }
    sealed class Handler : HttpMessageHandler
    {
        public Func<HttpRequestMessage,Task<HttpResponseMessage>> Reply;
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request,CancellationToken token) => Reply(request);
    }
    sealed class Tokens : IAccessTokenProvider
    { public Task<string> GetTokenAsync(string variable,CancellationToken ct) => Task.FromResult(variable=="VPS_TOKEN"?"vps-test":variable=="CDS_TOKEN"?"cds-test":null); }
    static HttpResponseMessage Response(string body,HttpStatusCode status=HttpStatusCode.OK) => new HttpResponseMessage(status) {Content=new StringContent(body)};
    static async Task ProtocolTests()
    {
        var sample=new CameraSubmission {Jpeg=new byte[]{1,2,3},Width=640,Height=480,Fx=500,Fy=501,Cx=320,Cy=240,TimestampMs=1700000000000};
        var pose=new BasicPose(new GeoPosition(60,10,100),Quaterniond.FromYpr(90,45,90));
        var handler=new Handler(); using var http=new HttpClient(handler);
        var client=new OscpClient(http,new Tokens());
        handler.Reply=async request=>
        {
            Check(request.Method==HttpMethod.Post,"VPS POST");
            Check(request.RequestUri.Query=="?mapCode=a%20b","Encoded map selector");
            Check(request.Headers.Authorization.Parameter=="vps-test","VPS auth scoped to request");
            Check(request.Headers.Accept.ToString().Contains("2.0"),"OSCP v2 accept");
            var json=JObject.Parse(await request.Content.ReadAsStringAsync());
            var image=json["sensorReadings"]["cameraReadings"][0];
            Check((string)image["imageBytes"]=="AQID","base64 image");
            Check(image["reading"]==null,"v2 flat camera reading");
            Check((string)image["params"]["model"]=="PINHOLE","PINHOLE");
            Near((double)image["params"]["modelParams"][1],501);
            Check(!(bool)image["imageOrientation"]["mirrored"],"upright non-mirrored image");
            return Response(new JObject { ["id"]=json["id"],["type"]="geopose",["geopose"]=GeoPoseJson.ToObject(pose) }.ToString());
        };
        var endpoint=new EndpointConfig {url="https://vps.example/geopose",mapCode="a b",bearerTokenEnvironment="VPS_TOKEN"};
        Rot((await client.Localize(endpoint,sample)).quaternion,pose.quaternion);
        Check(http.DefaultRequestHeaders.Authorization==null,"No credential propagation to other hosts");
        Throws(()=>new EndpointConfig {mapCode="a",mapSetCode="b"}.RequestUri());
        Throws(()=>new EndpointConfig {url="http://vps.example"}.RequestUri());
        handler.Reply=request=>Task.FromResult(Response("{\"error\":\"Pose not found\",\"reason\":\"no_map_in_range\"}",HttpStatusCode.NotFound));
        try {await client.Localize(endpoint,sample);throw new Exception("Expected OSCP error");}
        catch(OscpException e){Check(e.StatusCode==404 && e.Reason=="no_map_in_range","Coverage failure remains distinguishable");}
        int queries=0;
        handler.Reply=request=>
        {
            queries++;Check(request.Method==HttpMethod.Get,"CDS GET");
            Check(request.RequestUri.AbsolutePath=="/scrs/art" && request.RequestUri.Query.StartsWith("?h3Index="),"CDS topic + H3 contract");
            Check(request.Headers.Authorization.Parameter=="cds-test","Separate CDS token");
            var record=new JObject { ["id"]="one",["type"]="scr",["content"]=new JObject { ["title"]="Test",["geopose"]=GeoPoseJson.ToObject(pose),["refs"]=new JArray(new JObject { ["contentType"]="model/gltf-binary",["url"]="/models/test.glb" }) } };
            return Task.FromResult(Response(new JArray(record).ToString()));
        };
        var discovery=new DiscoveryConfig {enabled=true,url="https://cds.example",topic="art",h3Indexes=new[]{"881f1d4887fffff","881f1d4881fffff"},bearerTokenEnvironment="CDS_TOKEN",assetBaseUrl="https://assets.example/"};
        var assets=await client.Discover(discovery);Check(queries==2 && assets.Count==1,"Deduplicate records across cells");
        Check(assets[0].Url.AbsoluteUri=="https://assets.example/models/test.glb","Resolve content base URL");Rot(assets[0].Pose.quaternion,pose.quaternion);
        var config=DemoConfig.Parse("{\"selectedEndpoint\":\"second\",\"endpoints\":[{\"id\":\"first\"},{\"id\":\"second\",\"url\":\"https://other.example/vps\"}],\"discovery\":{\"bodyAxes\":\"GltfSourceXReflection\"}}");
        Check(config.Selected().url=="https://other.example/vps" && config.discovery.bodyAxes==BodyAxes.GltfSourceXReflection,"Config endpoint selection and body preset");
    }
}
