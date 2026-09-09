' ====================================================================
' Surya PM Portal V2.0 - Launcher (PM-Portal Subdirectory)
' ====================================================================
Option Explicit

Dim WshShell, fso, parentDir, targetUrl, attempts

Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
parentDir = fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName))
targetUrl = "http://localhost:3000/PM-Portal/index.html"

Function CheckServerRunning()
    On Error Resume Next
    Dim req
    Set req = CreateObject("MSXML2.ServerXMLHTTP.6.0")
    req.setTimeouts 1000, 1000, 1000, 1000
    req.open "GET", "http://localhost:3000/api/v1/health", False
    req.send
    If Err.Number = 0 And (req.status = 200 Or req.status = 307) Then
        CheckServerRunning = True
    Else
        CheckServerRunning = False
    End If
    On Error GoTo 0
End Function

If Not CheckServerRunning() Then
    WshShell.CurrentDirectory = parentDir
    WshShell.Run "cmd /c npm run dev", 0, False
    attempts = 0
    Do While attempts < 15
        WScript.Sleep 1000
        If CheckServerRunning() Then Exit Do
        attempts = attempts + 1
    Loop
End If

WshShell.Run "explorer """ & targetUrl & """", 1, False
