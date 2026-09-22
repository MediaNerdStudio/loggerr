using System.IO;
using System.Text.Json;

namespace Loggerr.Ingest;

internal static class SettingsStore {
  private static readonly string DirectoryPath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Loggerr", "Ingest");
  private static readonly string FilePath = Path.Combine(DirectoryPath, "settings.json");
  public static ClientSettings Load() { try { return JsonSerializer.Deserialize<ClientSettings>(File.ReadAllText(FilePath)) ?? new(); } catch { return new(); } }
  public static void Save(ClientSettings settings) { Directory.CreateDirectory(DirectoryPath); var temporary = $"{FilePath}.tmp"; File.WriteAllText(temporary, JsonSerializer.Serialize(settings, new JsonSerializerOptions { WriteIndented = true })); File.Move(temporary, FilePath, true); }
}
