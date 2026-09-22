using System.ComponentModel;
using System.Runtime.CompilerServices;
using System.Text.Json.Serialization;

namespace Loggerr.Ingest;

public sealed record AudioFormat([property: JsonPropertyName("sampleRate")] int SampleRate, [property: JsonPropertyName("channels")] int Channels, [property: JsonPropertyName("sampleFormat")] string SampleFormat);
public sealed record IngestFeed([property: JsonPropertyName("id")] string Id, [property: JsonPropertyName("title")] string Title, [property: JsonPropertyName("enabled")] bool Enabled, [property: JsonPropertyName("format")] AudioFormat Format, [property: JsonPropertyName("endpoint")] string Endpoint);
public sealed record AudioDevice(int Index, string Name, string HostApi, int MaxInputChannels, double DefaultSampleRate) { public string DisplayName => $"{HostApi} · {Name} ({MaxInputChannels} ch)"; }
public sealed record EncodingProfile(string Codec, string Name, int Bitrate) { public string DisplayName => Bitrate > 0 ? $"{Name} · {Bitrate / 1000} kbps" : Name; public static IReadOnlyList<EncodingProfile> Catalog { get; } = [new("s16le", "WAV / PCM 16-bit", 0), new("mp3", "MP3", 128000), new("mp3", "MP3", 192000), new("mp3", "MP3", 320000), new("aac", "AAC", 96000), new("aac", "AAC", 128000), new("aac", "AAC", 192000), new("aac", "AAC", 256000)]; }
public sealed record EncodingPreference(string Codec, int Bitrate);
public sealed class ClientSettings { public string ServerUrl { get; set; } = "http://localhost:3000"; public Dictionary<string, int> FeedDevices { get; set; } = []; public Dictionary<string, EncodingPreference> FeedEncodings { get; set; } = []; }

public sealed class FeedViewModel : INotifyPropertyChanged, IDisposable {
  private AudioDevice? selectedDevice; private EncodingProfile selectedEncoding = EncodingProfile.Catalog[0]; private string state = "Stopped"; private double leftDb = -100; private double rightDb = -100; private CaptureSession? session;
  public required IngestFeed Feed { get; init; }
  public required IReadOnlyList<AudioDevice> Devices { get; init; }
  public AudioDevice? SelectedDevice { get => selectedDevice; set { selectedDevice = value; Changed(); } }
  public IReadOnlyList<EncodingProfile> Encodings => EncodingProfile.Catalog;
  public EncodingProfile SelectedEncoding { get => selectedEncoding; set { selectedEncoding = value; Changed(); } }
  public string State { get => state; set { state = value; Changed(); } }
  public double LeftDb { get => leftDb; set { leftDb = value; Changed(); Changed(nameof(LeftWidth)); } }
  public double RightDb { get => rightDb; set { rightDb = value; Changed(); Changed(nameof(RightWidth)); } }
  public double LeftWidth => Math.Clamp((LeftDb + 60) / 60 * 220, 0, 220);
  public double RightWidth => Math.Clamp((RightDb + 60) / 60 * 220, 0, 220);
  public bool IsRunning => session is not null;
  public event PropertyChangedEventHandler? PropertyChanged;
  public async Task StartAsync(Uri server, string token) { if (SelectedDevice is null || session is not null) return; session = new CaptureSession(server, token, Feed, SelectedDevice, SelectedEncoding, (left, right, status) => App.Current.Dispatcher.Invoke(() => { LeftDb = left; RightDb = right; if (!string.IsNullOrEmpty(status)) State = status; })); Changed(nameof(IsRunning)); await session.StartAsync(); }
  public async Task StopAsync() { if (session is null) return; var active = session; session = null; await active.DisposeAsync(); State = "Stopped"; LeftDb = RightDb = -100; Changed(nameof(IsRunning)); }
  public void Dispose() { if (session is not null) session.DisposeAsync().AsTask().GetAwaiter().GetResult(); }
  private void Changed([CallerMemberName] string? name = null) => PropertyChanged?.Invoke(this, new(name));
}
