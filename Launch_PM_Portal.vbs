' ====================================================================
' Surya PM Portal & Operating System - V2.0 Local Windows Launcher
' ====================================================================
' Automatically detects if the V2 backend server is running on port 3000,
' starts it in the background if needed, waits for readiness, and launches
' the PM Portal in the default web browser.
' ====================================================================

Option Explicit

Dim WshShell, fso, http, currentDir, targetUrl, isServerRunning, attempts

Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
currentDir = fso.GetParentFolderName(WScript.ScriptFullName)
targetUrl = "http://localhost:3000/PM-Portal/index.html"

' Check if port 3000 is already active
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

isServerRunning = CheckServerRunning()

If Not isServerRunning Then
    ' Start the V2 Node/Express + Vite server silently in the background
    WshShell.CurrentDirectory = currentDir
    WshShell.Run "cmd /c npm run dev", 0, False

    ' Wait up to 15 seconds for the server to spin up
    attempts = 0
    Do While attempts < 15
        WScript.Sleep 1000
        If CheckServerRunning() Then
            Exit Do
        End If
        attempts = attempts + 1
    Loop
End If

' Open the PM Portal in the user's default browser
WshShell.Run "explorer """ & targetUrl & """", 1, False

Set WshShell = Nothing
Set fso = Nothing
