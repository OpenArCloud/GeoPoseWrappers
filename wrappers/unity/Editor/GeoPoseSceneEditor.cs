using OpenArCloud.GeoPose.Unity;
using UnityEditor;
using UnityEngine;

namespace OpenArCloud.GeoPose.Editor
{
    [CustomEditor(typeof(GeoPoseScene))]
    public sealed class GeoPoseSceneEditor : UnityEditor.Editor
    {
        public override void OnInspectorGUI()
        {
            DrawDefaultInspector();
            EditorGUILayout.HelpBox("Unity X = East, Y = Up, Z = North. Origin height is WGS84 ellipsoidal metres. Use Rebase to change an active scene origin.",MessageType.Info);
            if(GUILayout.Button("Rebase to inspector origin")) { var scene=(GeoPoseScene)target; Undo.RecordObjects(scene.GetComponentsInChildren<Transform>(),"Rebase GeoPose scene"); scene.Rebase(scene.origin); }
        }
        private void OnSceneGUI()
        {
            var t=((GeoPoseScene)target).transform;
            Handles.Label(t.TransformPoint(Vector3.right*2),"East (+X)");
            Handles.Label(t.TransformPoint(Vector3.up*2),"Up (+Y)");
            Handles.Label(t.TransformPoint(Vector3.forward*2),"North (+Z)");
        }
        [MenuItem("GameObject/GeoPose/Shared ENU scene",false,10)]
        private static void Create() { var go=new GameObject("GeoPose ENU scene",typeof(GeoPoseScene)); Undo.RegisterCreatedObjectUndo(go,"Create GeoPose scene"); Selection.activeGameObject=go; }
    }
}
