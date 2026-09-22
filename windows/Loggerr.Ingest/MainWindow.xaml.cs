using System.Collections.ObjectModel;
using System.Windows;
using System.Windows.Controls;

namespace Loggerr.Ingest;

public partial class MainWindow : Window {
  private readonly ObservableCollection<FeedViewModel> feeds = []; private ClientSettings settings = SettingsStore.Load(); private IReadOnlyList<AudioDevice> devices = [];
  public MainWindow() { InitializeComponent(); FeedList.ItemsSource = feeds; ServerUrl.Text = settings.ServerUrl; Token.Password = CredentialStore.Load(); Loaded += (_, _) => RefreshDevices(); Closed += (_, _) => { foreach (var feed in feeds) feed.Dispose(); PortAudio.Shutdown(); }; }
  private void RefreshDevices() { try { devices = PortAudio.GetDevices(); GlobalStatus.Text = $"Found {devices.Count} input endpoints across {devices.Select(device => device.HostApi).Distinct().Count()} host APIs."; } catch (Exception error) { GlobalStatus.Text = $"PortAudio unavailable: {error.Message}. Copy portaudio.dll beside Loggerr.Ingest.exe."; } }
  private void RefreshDevices_Click(object sender, RoutedEventArgs e) => RefreshDevices();
  private async void Discover_Click(object sender, RoutedEventArgs e) { try { settings.ServerUrl = ServerUrl.Text.Trim().TrimEnd('/'); CredentialStore.Save(Token.Password); SettingsStore.Save(settings); using var api = new ApiClient(new Uri(settings.ServerUrl), Token.Password); var discovered = await api.GetFeedsAsync(); foreach (var feed in feeds) feed.Dispose(); feeds.Clear(); foreach (var feed in discovered) { var model = new FeedViewModel { Feed = feed, Devices = devices }; if (settings.FeedDevices.TryGetValue(feed.Id, out var deviceIndex)) model.SelectedDevice = devices.FirstOrDefault(device => device.Index == deviceIndex); model.SelectedDevice ??= devices.FirstOrDefault(device => device.MaxInputChannels >= feed.Format.Channels); if (settings.FeedEncodings.TryGetValue(feed.Id, out var encoding)) model.SelectedEncoding = EncodingProfile.Catalog.FirstOrDefault(item => item.Codec == encoding.Codec && item.Bitrate == encoding.Bitrate) ?? EncodingProfile.Catalog[0]; feeds.Add(model); } GlobalStatus.Text = $"Discovered {feeds.Count} ingest feeds."; } catch (Exception error) { GlobalStatus.Text = $"Discovery failed: {error.Message}"; } }
  private async void StartFeed_Click(object sender, RoutedEventArgs e) { if ((sender as Button)?.Tag is not FeedViewModel feed || feed.SelectedDevice is null) return; try { settings.FeedDevices[feed.Feed.Id] = feed.SelectedDevice.Index; settings.FeedEncodings[feed.Feed.Id] = new(feed.SelectedEncoding.Codec, feed.SelectedEncoding.Bitrate); SettingsStore.Save(settings); await feed.StartAsync(new Uri(settings.ServerUrl), Token.Password); } catch (Exception error) { feed.State = $"Error: {error.Message}"; } }
  private async void StopFeed_Click(object sender, RoutedEventArgs e) { if ((sender as Button)?.Tag is FeedViewModel feed) await feed.StopAsync(); }
}
