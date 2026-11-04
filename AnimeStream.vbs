' AnimeStream Desktop - Lanzador Silencioso (Sin ventana de consola CMD)
Set WshShell = CreateObject("WScript.Shell")
Set FSO = CreateObject("Scripting.FileSystemObject")
strDir = FSO.GetParentFolderName(WScript.ScriptFullName)
WshShell.CurrentDirectory = strDir

' Rutas prioritarias de Node.js y Electron
electronBin = strDir & "\node_modules\electron\dist\electron.exe"

If FSO.FileExists(electronBin) Then
    ' Ejecución 100% nativa sin ventana de comandos
    WshShell.Run """" & electronBin & """ electron\main.js", 0, False
Else
    ' Si faltan módulos, se invoca el inicializador en segundo plano
    batFile = strDir & "\iniciar_electron.bat"
    WshShell.Run "cmd.exe /c """ & batFile & """", 0, False
End If
