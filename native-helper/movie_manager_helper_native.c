#include <ctype.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <unistd.h>

#define MAX_MESSAGE (1024 * 1024)
#define MAX_PATH_LEN 4096

static const char *LOG_PATH = "/tmp/movie_manager_helper.log";

static void log_line(const char *message) {
  FILE *file = fopen(LOG_PATH, "a");
  if (!file) return;
  fprintf(file, "%s\n", message);
  fclose(file);
}

static void write_response(const char *json) {
  uint32_t len = (uint32_t)strlen(json);
  fwrite(&len, sizeof(len), 1, stdout);
  fwrite(json, 1, len, stdout);
  fflush(stdout);
}

static char *read_message(void) {
  uint32_t len = 0;
  if (fread(&len, sizeof(len), 1, stdin) != 1) {
    log_line("native: no length bytes");
    return NULL;
  }
  if (len == 0 || len > MAX_MESSAGE) {
    log_line("native: invalid message length");
    return NULL;
  }
  char *buffer = calloc(len + 1, 1);
  if (!buffer) return NULL;
  if (fread(buffer, 1, len, stdin) != len) {
    free(buffer);
    log_line("native: short message read");
    return NULL;
  }
  log_line("native: message read");
  return buffer;
}

static int json_extract_string(const char *json, const char *key, char *out, size_t out_size) {
  char needle[128];
  snprintf(needle, sizeof(needle), "\"%s\"", key);
  const char *pos = strstr(json, needle);
  if (!pos) return 0;
  pos = strchr(pos + strlen(needle), ':');
  if (!pos) return 0;
  pos++;
  while (*pos && isspace((unsigned char)*pos)) pos++;
  if (*pos != '"') return 0;
  pos++;

  size_t index = 0;
  while (*pos && *pos != '"' && index + 1 < out_size) {
    if (*pos == '\\' && pos[1]) pos++;
    out[index++] = *pos++;
  }
  out[index] = '\0';
  return index > 0;
}

static int has_video_suffix(const char *path) {
  const char *dot = strrchr(path, '.');
  if (!dot) return 0;
  const char *suffixes[] = {".mp4", ".ts", ".mkv", ".avi", ".mov", ".wmv", ".flv", ".m4v"};
  for (size_t i = 0; i < sizeof(suffixes) / sizeof(suffixes[0]); i++) {
    if (strcasecmp(dot, suffixes[i]) == 0) return 1;
  }
  return 0;
}

static int file_exists(const char *path) {
  struct stat st;
  return stat(path, &st) == 0 && S_ISREG(st.st_mode);
}

static void helper_dir(char *out, size_t out_size, const char *argv0) {
  char resolved[MAX_PATH_LEN];
  if (!realpath(argv0, resolved)) {
    strncpy(out, ".", out_size - 1);
    out[out_size - 1] = '\0';
    return;
  }
  char *slash = strrchr(resolved, '/');
  if (slash) *slash = '\0';
  strncpy(out, resolved, out_size - 1);
  out[out_size - 1] = '\0';
}

static int path_allowed(const char *config, const char *path) {
  const char *roots = strstr(config, "\"allowedRoots\"");
  if (!roots) return 0;
  const char *array = strchr(roots, '[');
  const char *end = strchr(roots, ']');
  if (!array || !end || end <= array) return 0;

  const char *pos = array;
  while (pos < end) {
    const char *quote = strchr(pos, '"');
    if (!quote || quote >= end) break;
    quote++;
    char root[MAX_PATH_LEN] = {0};
    size_t index = 0;
    while (*quote && *quote != '"' && quote < end && index + 1 < sizeof(root)) {
      if (*quote == '\\' && quote[1]) quote++;
      root[index++] = *quote++;
    }
    root[index] = '\0';
    if (index > 0) {
      size_t root_len = strlen(root);
      if (strncmp(path, root, root_len) == 0 && (path[root_len] == '/' || path[root_len] == '\0')) {
        return 1;
      }
    }
    pos = quote + 1;
  }
  return 0;
}

static char *read_config(const char *argv0) {
  char dir[MAX_PATH_LEN];
  helper_dir(dir, sizeof(dir), argv0);
  char config_path[MAX_PATH_LEN];
  snprintf(config_path, sizeof(config_path), "%s/config.json", dir);
  FILE *file = fopen(config_path, "r");
  if (!file) return strdup("{\"allowedRoots\":[],\"player\":\"\"}");
  fseek(file, 0, SEEK_END);
  long size = ftell(file);
  rewind(file);
  char *buffer = calloc((size_t)size + 1, 1);
  if (buffer) fread(buffer, 1, (size_t)size, file);
  fclose(file);
  return buffer;
}

static void open_file(const char *config, const char *path) {
  char player[MAX_PATH_LEN] = {0};
  if (json_extract_string(config, "player", player, sizeof(player)) && strlen(player) > 0) {
    execl("/usr/bin/open", "open", "-a", player, path, (char *)NULL);
  } else {
    execl(
      "/bin/sh",
      "sh",
      "-c",
      "open -a IINA \"$1\" 2>/dev/null || "
      "open -a VLC \"$1\" 2>/dev/null || "
      "(command -v ffplay >/dev/null 2>&1 && ffplay -autoexit \"$1\") || "
      "open \"$1\"",
      "movie-manager-open",
      path,
      (char *)NULL
    );
  }
}

int main(int argc, char **argv) {
  (void)argc;
  log_line("native: started");
  char *message = read_message();
  if (!message) {
    write_response("{\"ok\":false,\"error\":\"No message received\"}");
    return 0;
  }

  if (strstr(message, "\"PING_HELPER\"")) {
    char *config = read_config(argv[0]);
    int count = 0;
    const char *pos = strstr(config, "\"allowedRoots\"");
    if (pos) {
      const char *end = strchr(pos, ']');
      while ((pos = strchr(pos, '"')) && pos < end) {
        pos++;
        const char *next = strchr(pos, '"');
        if (!next || next >= end) break;
        count++;
        pos = next + 1;
      }
      if (count > 0) count--;
    }
    free(config);
    char response[256];
    snprintf(response, sizeof(response), "{\"ok\":true,\"message\":\"Native helper 正常。允许目录：%d 个\"}", count);
    write_response(response);
    free(message);
    return 0;
  }

  char path[MAX_PATH_LEN] = {0};
  if (!json_extract_string(message, "displayPath", path, sizeof(path))) {
    write_response("{\"ok\":false,\"error\":\"Missing absolute path\"}");
    free(message);
    return 0;
  }

  char resolved[MAX_PATH_LEN] = {0};
  if (!realpath(path, resolved)) {
    write_response("{\"ok\":false,\"error\":\"File does not exist\"}");
    free(message);
    return 0;
  }
  if (!has_video_suffix(resolved) || !file_exists(resolved)) {
    write_response("{\"ok\":false,\"error\":\"Only existing video files can be opened\"}");
    free(message);
    return 0;
  }

  char *config = read_config(argv[0]);
  if (!path_allowed(config, resolved)) {
    write_response("{\"ok\":false,\"error\":\"Path is outside allowed roots\"}");
    free(config);
    free(message);
    return 0;
  }

  pid_t pid = fork();
  if (pid == 0) {
    open_file(config, resolved);
    _exit(1);
  }

  write_response("{\"ok\":true,\"message\":\"已发送本机打开请求。\"}");
  free(config);
  free(message);
  return 0;
}
