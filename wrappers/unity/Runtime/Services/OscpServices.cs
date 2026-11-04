using System;
using System.Collections.Generic;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace OpenArCloud.GeoPose
{
    public enum CameraAxes { RightUpBack, RightDownForward, ForwardLeftUp }
    public static class CameraConventions
    {
        // Normalize an endpoint's declared camera body to the wrapper's right/up/back camera body.
        public static BasicPose ToRightUpBack(BasicPose pose,CameraAxes axes)
        {
            Quaterniond correction;
            switch(axes)
            {
                case CameraAxes.RightUpBack: correction=Quaterniond.Identity; break;
                case CameraAxes.RightDownForward: correction=new Quaterniond(1,0,0,0); break;
                case CameraAxes.ForwardLeftUp: correction=Quaterniond.FromMatrix(new Matrix3d(new Vector3d(0,-1,0),new Vector3d(0,0,1),new Vector3d(-1,0,0))); break;
                default: throw new ArgumentOutOfRangeException(nameof(axes));
            }
            return new BasicPose(pose.position,pose.quaternion*correction);
        }
    }
    [Serializable] public sealed class EndpointConfig
    {
        public string id="multiset";
        public string url="https://api.multiset.ai/v1/vps/map/geopose";
        public string bearerTokenEnvironment="MULTISET_ACCESS_TOKEN";
        public string mapCode="",mapSetCode="";
        public CameraAxes cameraAxes=CameraAxes.RightUpBack;
        public Uri RequestUri()
        {
            var uri=ServiceUris.Https(url);
            if(!string.IsNullOrEmpty(mapCode) && !string.IsNullOrEmpty(mapSetCode)) throw new ArgumentException("Choose mapCode OR mapSetCode.");
            string key=!string.IsNullOrEmpty(mapCode)?"mapCode":!string.IsNullOrEmpty(mapSetCode)?"mapSetCode":null;
            return key==null?uri:ServiceUris.Query(uri,key,key=="mapCode"?mapCode:mapSetCode);
        }
    }
    [Serializable] public sealed class DiscoveryConfig
    {
        public bool enabled=false;
        public string url="",topic="",bearerTokenEnvironment="OSCP_CDS_ACCESS_TOKEN",assetBaseUrl="";
        public string[] h3Indexes=Array.Empty<string>();
        public BodyAxes bodyAxes=BodyAxes.ForwardLeftUp;
        public int maxAssets=12;
        public double maxDistanceMetres=100;
    }
    [Serializable] public sealed class DemoConfig
    {
        public string selectedEndpoint="multiset";
        public EndpointConfig[] endpoints={new EndpointConfig()};
        public DiscoveryConfig discovery=new DiscoveryConfig();
        public bool includeLocationHint=false;
        public int imageLongEdge=1280;
        public EndpointConfig Selected()
        {
            foreach(var e in endpoints) if(e.id==selectedEndpoint) return e;
            throw new ArgumentException("selectedEndpoint does not match an endpoint id.");
        }
        public static DemoConfig Parse(string json) => JsonConvert.DeserializeObject<DemoConfig>(json,new JsonSerializerSettings { TypeNameHandling=TypeNameHandling.None }) ?? throw new FormatException("Empty demo config.");
    }
    public static class ServiceUris
    {
        public static Uri Https(string url)
        {
            if(!Uri.TryCreate(url,UriKind.Absolute,out var u) || u.Scheme!="https" || !string.IsNullOrEmpty(u.UserInfo) || !string.IsNullOrEmpty(u.Fragment))
                throw new ArgumentException("Expected an absolute HTTPS URL without credentials or fragment.");
            return u;
        }
        public static Uri Query(Uri uri,string key,string value)
        {
            var b=new UriBuilder(uri); b.Query=(string.IsNullOrEmpty(b.Query)?"":b.Query.Substring(1)+"&")+Uri.EscapeDataString(key)+"="+Uri.EscapeDataString(value); return b.Uri;
        }
    }
    public interface IAccessTokenProvider
    {
        Task<string> GetTokenAsync(string environmentVariable,CancellationToken cancellation);
    }
    // Editor/desktop convenience. Mobile applications should inject their own runtime token provider.
    public sealed class EnvironmentTokens : IAccessTokenProvider
    {
        public Task<string> GetTokenAsync(string variable,CancellationToken cancellation) => Task.FromResult(string.IsNullOrEmpty(variable)?null:Environment.GetEnvironmentVariable(variable));
    }
    // Tokens are kept only in memory. Useful for a device demo; production apps can provide a refreshing implementation.
    public sealed class RuntimeTokens : IAccessTokenProvider
    {
        private readonly Dictionary<string,string> values=new Dictionary<string,string>();
        public void Set(string name,string token) { if(!string.IsNullOrEmpty(name)) values[name]=token; }
        public Task<string> GetTokenAsync(string name,CancellationToken ct) => Task.FromResult(
            !string.IsNullOrEmpty(name) && values.TryGetValue(name,out var token) && !string.IsNullOrEmpty(token)?token:
            string.IsNullOrEmpty(name)?null:Environment.GetEnvironmentVariable(name));
    }
    public sealed class OscpException : Exception
    {
        public int StatusCode { get; }
        public string Reason { get; }
        public OscpException(int code,string reason) : base("OSCP request failed (HTTP "+code+")."+(string.IsNullOrEmpty(reason)?"":" Reason: "+reason)) { StatusCode=code; Reason=reason; }
    }
    public sealed class CameraSubmission
    {
        public byte[] Jpeg;
        public int Width,Height;
        public double Fx,Fy,Cx,Cy;
        public long TimestampMs;
        public GeoPosition? LocationHint;
        // The input must already be an upright, non-mirrored image in its declared camera body basis.
        public JObject Request(string id)
        {
            if(Jpeg==null || Jpeg.Length==0 || Width<=0 || Height<=0 || Fx<=0 || Fy<=0 || TimestampMs<=0) throw new ArgumentException("Invalid camera submission.");
            Numbers.Finite(Fx); Numbers.Finite(Fy); Numbers.Finite(Cx); Numbers.Finite(Cy);
            var privacy=new JObject { ["dataRetention"]=new JArray(),["dataAcceptableUse"]=new JArray(),["dataSanitizationApplied"]=new JArray(),["dataSanitizationRequested"]=new JArray() };
            var readings=new JObject { ["cameraReadings"]=new JArray(new JObject {
                ["timestamp"]=TimestampMs,["sensorId"]="camera",["sequenceNumber"]=0,["privacy"]=privacy,
                ["imageFormat"]="JPG",["size"]=new JArray(Width,Height),["imageBytes"]=Convert.ToBase64String(Jpeg),
                ["imageOrientation"]=new JObject { ["mirrored"]=false,["rotation"]=0 },
                ["params"]=new JObject { ["model"]="PINHOLE",["modelParams"]=new JArray(Fx,Fy,Cx,Cy) }
            }) };
            var sensors=new JArray(new JObject { ["id"]="camera",["type"]="camera" });
            if(LocationHint.HasValue)
            {
                var p=LocationHint.Value; p.Validate(); sensors.Add(new JObject { ["id"]="location",["type"]="geolocation" });
                readings["geolocationReadings"]=new JArray(new JObject { ["timestamp"]=TimestampMs,["sensorId"]="location",["privacy"]=privacy.DeepClone(),["latitude"]=p.lat,["longitude"]=p.lon,["altitude"]=p.h });
            }
            return new JObject { ["id"]=id,["timestamp"]=TimestampMs,["type"]="geopose",["sensors"]=sensors,["sensorReadings"]=readings };
        }
    }
    public sealed class DiscoveredAsset
    {
        public string Id,Title;
        public Uri Url;
        public BasicPose Pose;
    }
    // HttpClient is supplied by the host; do not set shared authorization headers (asset hosts differ).
    public sealed class OscpClient
    {
        private readonly HttpClient http;
        private readonly IAccessTokenProvider tokens;
        public OscpClient(HttpClient http,IAccessTokenProvider tokens=null) { this.http=http??throw new ArgumentNullException(nameof(http)); this.tokens=tokens??new EnvironmentTokens(); }
        private async Task<JToken> Send(HttpRequestMessage request,string tokenVariable,CancellationToken ct)
        {
            using(request)
            {
                var token=await tokens.GetTokenAsync(tokenVariable,ct);
                if(!string.IsNullOrEmpty(token)) request.Headers.Authorization=new AuthenticationHeaderValue("Bearer",token);
                using(var response=await http.SendAsync(request,ct))
                {
                    var text=await response.Content.ReadAsStringAsync(); ct.ThrowIfCancellationRequested();
                    if(!response.IsSuccessStatusCode)
                    {
                        string reason=null;
                        try { var r=(string)JObject.Parse(text)["reason"]; if(r=="no_map_in_range") reason=r; } catch(JsonException) { }
                        throw new OscpException((int)response.StatusCode,reason); // Never log image bodies or credentials.
                    }
                    return JToken.Parse(text);
                }
            }
        }
        public async Task<BasicPose> Localize(EndpointConfig endpoint,CameraSubmission image,CancellationToken ct=default)
        {
            var request=new HttpRequestMessage(HttpMethod.Post,endpoint.RequestUri());
            request.Headers.TryAddWithoutValidation("Accept","application/vnd.oscp+json;version=2.0");
            string id=Guid.NewGuid().ToString();
            request.Content=new StringContent(image.Request(id).ToString(Formatting.None),Encoding.UTF8,"application/json");
            var response=await Send(request,endpoint.bearerTokenEnvironment,ct);
            if((string)response["type"]!="geopose" || response["geopose"]==null) throw new FormatException("Expected an OSCP GeoPose response.");
            return GeoPoseJson.Parse(response["geopose"]);
        }
        public async Task<IReadOnlyList<DiscoveredAsset>> Discover(DiscoveryConfig config,GeoPosition searchOrigin,CancellationToken ct=default)
        {
            var result=new List<DiscoveredAsset>(); var seen=new HashSet<string>();
            if(!config.enabled) return result;
            if(string.IsNullOrWhiteSpace(config.topic) || config.h3Indexes==null || config.h3Indexes.Length==0 || config.maxAssets<1) throw new ArgumentException("Discovery needs a topic, H3 coverage cells and a positive maxAssets.");
            if(Numbers.Finite(config.maxDistanceMetres)<=0) throw new ArgumentException("maxDistanceMetres must be positive and finite.");
            var originEcef=Wgs84.ToEcef(searchOrigin);
            var root=ServiceUris.Https(config.url.TrimEnd('/')+"/scrs/"+Uri.EscapeDataString(config.topic));
            foreach(string cell in config.h3Indexes)
            {
                var request=new HttpRequestMessage(HttpMethod.Get,ServiceUris.Query(root,"h3Index",cell));
                request.Headers.TryAddWithoutValidation("Accept","application/vnd.oscp+json;version=1.0");
                var records=await Send(request,config.bearerTokenEnvironment,ct) as JArray ?? throw new FormatException("CDS must return an SCR array.");
                foreach(var record in records)
                {
                    var content=record["content"]; string id=(string)record["id"];
                    if(content==null || string.IsNullOrEmpty(id) || seen.Contains(id) || !(content["refs"] is JArray refs)) continue;
                    foreach(var reference in refs)
                    {
                        if((string)reference["contentType"]!="model/gltf-binary") continue;
                        string url=(string)reference["url"];
                        if(string.IsNullOrEmpty(url)) continue;
                        var pose=GeoPoseJson.Parse(content["geopose"]);
                        // Only nearby assets count toward maxAssets; continue across records/cells otherwise.
                        if((Wgs84.ToEcef(pose.position)-originEcef).Length>config.maxDistanceMetres) break;
                        // .NET treats a leading '/' as an absolute file URI; CDS root-relative URLs are HTTP paths.
                        if(!Uri.TryCreate(url,UriKind.Absolute,out var assetUri) || url.StartsWith("/",StringComparison.Ordinal))
                        {
                            if(string.IsNullOrEmpty(config.assetBaseUrl)) throw new FormatException("Relative content URL requires assetBaseUrl.");
                            assetUri=new Uri(ServiceUris.Https(config.assetBaseUrl),url);
                        }
                        assetUri=ServiceUris.Https(assetUri.AbsoluteUri);
                        result.Add(new DiscoveredAsset { Id=id,Title=(string)content["title"]??id,Url=assetUri,Pose=pose }); seen.Add(id);
                        break;
                    }
                    if(result.Count>=config.maxAssets) return result;
                }
            }
            return result;
        }
    }
}
