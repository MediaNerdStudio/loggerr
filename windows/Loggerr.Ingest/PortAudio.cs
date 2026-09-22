using System.Runtime.InteropServices;

namespace Loggerr.Ingest;

internal static class PortAudio {
  private static bool initialized;
  public const uint Float32 = 0x00000001;
  [UnmanagedFunctionPointer(CallingConvention.Cdecl)] public delegate int StreamCallback(IntPtr input, IntPtr output, uint frameCount, IntPtr timeInfo, uint statusFlags, IntPtr userData);
  [StructLayout(LayoutKind.Sequential)] public struct StreamParameters { public int Device; public int ChannelCount; public uint SampleFormat; public double SuggestedLatency; public IntPtr HostApiSpecificStreamInfo; }
  [StructLayout(LayoutKind.Sequential)] private struct DeviceInfo { public int StructVersion; public IntPtr Name; public int HostApi; public int MaxInputChannels; public int MaxOutputChannels; public double DefaultLowInputLatency; public double DefaultLowOutputLatency; public double DefaultHighInputLatency; public double DefaultHighOutputLatency; public double DefaultSampleRate; }
  [StructLayout(LayoutKind.Sequential)] private struct HostApiInfo { public int StructVersion; public int Type; public IntPtr Name; public int DeviceCount; public int DefaultInputDevice; public int DefaultOutputDevice; }
  [DllImport("portaudio_x64", CallingConvention = CallingConvention.Cdecl)] public static extern int Pa_Initialize();
  [DllImport("portaudio_x64", CallingConvention = CallingConvention.Cdecl)] public static extern int Pa_Terminate();
  [DllImport("portaudio_x64", CallingConvention = CallingConvention.Cdecl)] private static extern int Pa_GetDeviceCount();
  [DllImport("portaudio_x64", CallingConvention = CallingConvention.Cdecl)] private static extern IntPtr Pa_GetDeviceInfo(int device);
  [DllImport("portaudio_x64", CallingConvention = CallingConvention.Cdecl)] private static extern IntPtr Pa_GetHostApiInfo(int hostApi);
  [DllImport("portaudio_x64", CallingConvention = CallingConvention.Cdecl)] public static extern int Pa_OpenStream(out IntPtr stream, ref StreamParameters input, IntPtr output, double sampleRate, uint framesPerBuffer, uint flags, StreamCallback callback, IntPtr userData);
  [DllImport("portaudio_x64", CallingConvention = CallingConvention.Cdecl)] public static extern int Pa_StartStream(IntPtr stream);
  [DllImport("portaudio_x64", CallingConvention = CallingConvention.Cdecl)] public static extern int Pa_StopStream(IntPtr stream);
  [DllImport("portaudio_x64", CallingConvention = CallingConvention.Cdecl)] public static extern int Pa_CloseStream(IntPtr stream);
  [DllImport("portaudio_x64", CallingConvention = CallingConvention.Cdecl)] private static extern IntPtr Pa_GetErrorText(int errorCode);
  public static void Check(int result) { if (result < 0) throw new InvalidOperationException(Marshal.PtrToStringAnsi(Pa_GetErrorText(result)) ?? $"PortAudio error {result}"); }
  public static IReadOnlyList<AudioDevice> GetDevices() { if (!initialized) { Check(Pa_Initialize()); initialized = true; } var devices = new List<AudioDevice>(); var count = Pa_GetDeviceCount(); Check(count); for (var index = 0; index < count; index++) { var pointer = Pa_GetDeviceInfo(index); if (pointer == IntPtr.Zero) continue; var info = Marshal.PtrToStructure<DeviceInfo>(pointer); if (info.MaxInputChannels < 1) continue; var hostPointer = Pa_GetHostApiInfo(info.HostApi); var host = Marshal.PtrToStructure<HostApiInfo>(hostPointer); devices.Add(new(index, Marshal.PtrToStringUTF8(info.Name) ?? $"Device {index}", Marshal.PtrToStringUTF8(host.Name) ?? "Unknown", info.MaxInputChannels, info.DefaultSampleRate)); } return devices.OrderBy(device => device.HostApi).ThenBy(device => device.Name).ToArray(); }
  public static void Shutdown() { if (initialized) { Pa_Terminate(); initialized = false; } }
  public static double GetLowInputLatency(int device) { var info = Marshal.PtrToStructure<DeviceInfo>(Pa_GetDeviceInfo(device)); return info.DefaultLowInputLatency; }
}
