using System.Runtime.InteropServices;
using System.Text;

namespace Loggerr.Ingest;

internal static class CredentialStore {
  private const string Target = "Loggerr.Ingest.Token";
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)] private struct Credential { public uint Flags; public uint Type; public string TargetName; public string? Comment; public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten; public uint CredentialBlobSize; public IntPtr CredentialBlob; public uint Persist; public uint AttributeCount; public IntPtr Attributes; public string? TargetAlias; public string UserName; }
  [DllImport("advapi32", EntryPoint = "CredWriteW", CharSet = CharSet.Unicode, SetLastError = true)] private static extern bool CredWrite(ref Credential credential, uint flags);
  [DllImport("advapi32", EntryPoint = "CredReadW", CharSet = CharSet.Unicode, SetLastError = true)] private static extern bool CredRead(string target, uint type, uint flags, out IntPtr credential);
  [DllImport("advapi32", SetLastError = true)] private static extern void CredFree(IntPtr credential);
  public static void Save(string token) { var bytes = Encoding.Unicode.GetBytes(token); var pointer = Marshal.AllocCoTaskMem(bytes.Length); try { Marshal.Copy(bytes, 0, pointer, bytes.Length); var credential = new Credential { Type = 1, TargetName = Target, CredentialBlobSize = (uint)bytes.Length, CredentialBlob = pointer, Persist = 2, UserName = Environment.UserName }; if (!CredWrite(ref credential, 0)) throw new InvalidOperationException($"Could not save credential ({Marshal.GetLastWin32Error()})"); } finally { Marshal.FreeCoTaskMem(pointer); } }
  public static string Load() { if (!CredRead(Target, 1, 0, out var pointer)) return ""; try { var credential = Marshal.PtrToStructure<Credential>(pointer); return Marshal.PtrToStringUni(credential.CredentialBlob, (int)credential.CredentialBlobSize / 2) ?? ""; } finally { CredFree(pointer); } }
}
