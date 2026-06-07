#include <ctype.h>
#include <dirent.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <unistd.h>

#define MAX_MESSAGE (1024 * 1024)
#define MAX_PATH_LEN 4096
#define MAX_SCAN_FILES 30000

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
  size_t path_len = strlen(path);
  while (path_len > 0 && (isspace((unsigned char)path[path_len - 1]) || path[path_len - 1] == '?')) {
    path_len--;
  }

  const char *dot = NULL;
  for (size_t i = path_len; i > 0; i--) {
    if (path[i - 1] == '.') {
      dot = path + i - 1;
      break;
    }
  }
  if (!dot) return 0;
  const char *suffixes[] = {".mp4", ".ts", ".mkv", ".avi", ".mov", ".wmv", ".flv", ".m4v"};
  for (size_t i = 0; i < sizeof(suffixes) / sizeof(suffixes[0]); i++) {
    size_t suffix_len = strlen(suffixes[i]);
    if ((size_t)(path + path_len - dot) == suffix_len && strncasecmp(dot, suffixes[i], suffix_len) == 0) {
      return 1;
    }
  }
  return 0;
}

static int file_exists(const char *path) {
  struct stat st;
  return stat(path, &st) == 0 && S_ISREG(st.st_mode);
}

static int dir_exists(const char *path) {
  struct stat st;
  return stat(path, &st) == 0 && S_ISDIR(st.st_mode);
}

typedef struct {
  char *data;
  size_t len;
  size_t cap;
  int failed;
} JsonBuffer;

static void json_reserve(JsonBuffer *buffer, size_t extra) {
  if (buffer->failed || buffer->len + extra + 1 <= buffer->cap) return;
  size_t next = buffer->cap ? buffer->cap : 4096;
  while (next < buffer->len + extra + 1) next *= 2;
  char *data = realloc(buffer->data, next);
  if (!data) {
    buffer->failed = 1;
    return;
  }
  buffer->data = data;
  buffer->cap = next;
}

static void json_append(JsonBuffer *buffer, const char *text) {
  size_t len = strlen(text);
  json_reserve(buffer, len);
  if (buffer->failed) return;
  memcpy(buffer->data + buffer->len, text, len);
  buffer->len += len;
  buffer->data[buffer->len] = '\0';
}

static void json_append_char(JsonBuffer *buffer, char ch) {
  json_reserve(buffer, 1);
  if (buffer->failed) return;
  buffer->data[buffer->len++] = ch;
  buffer->data[buffer->len] = '\0';
}

static void json_append_escaped(JsonBuffer *buffer, const char *text) {
  json_append_char(buffer, '"');
  for (const unsigned char *pos = (const unsigned char *)text; *pos; pos++) {
    if (*pos == '"' || *pos == '\\') {
      json_append_char(buffer, '\\');
      json_append_char(buffer, (char)*pos);
    } else if (*pos == '\n') {
      json_append(buffer, "\\n");
    } else if (*pos == '\r') {
      json_append(buffer, "\\r");
    } else if (*pos == '\t') {
      json_append(buffer, "\\t");
    } else if (*pos < 0x20) {
      json_append(buffer, "\\u001f");
    } else {
      json_append_char(buffer, (char)*pos);
    }
  }
  json_append_char(buffer, '"');
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

static void append_file_json(JsonBuffer *buffer, const char *filename, const char *relative_path, long long size) {
  json_append(buffer, "{\"filename\":");
  json_append_escaped(buffer, filename);
  json_append(buffer, ",\"relative_path\":");
  json_append_escaped(buffer, relative_path);
  json_append(buffer, ",\"size_bytes\":");
  char size_text[64];
  snprintf(size_text, sizeof(size_text), "%lld", size);
  json_append(buffer, size_text);
  json_append(buffer, ",\"mtime\":null}");
}

static void scan_directory_recursive(
  const char *root,
  const char *relative,
  JsonBuffer *files,
  int *seen,
  int *file_count,
  int *skipped_count,
  int *read_error_count
) {
  if (*file_count >= MAX_SCAN_FILES || files->failed) return;

  char dir_path[MAX_PATH_LEN];
  if (relative[0]) {
    snprintf(dir_path, sizeof(dir_path), "%s/%s", root, relative);
  } else {
    snprintf(dir_path, sizeof(dir_path), "%s", root);
  }

  DIR *dir = opendir(dir_path);
  if (!dir) {
    (*read_error_count)++;
    return;
  }

  struct dirent *entry;
  while ((entry = readdir(dir)) != NULL && *file_count < MAX_SCAN_FILES && !files->failed) {
    const char *name = entry->d_name;
    if (name[0] == '.') continue;

    char child_relative[MAX_PATH_LEN];
    if (relative[0]) {
      snprintf(child_relative, sizeof(child_relative), "%s/%s", relative, name);
    } else {
      snprintf(child_relative, sizeof(child_relative), "%s", name);
    }

    char child_path[MAX_PATH_LEN];
    snprintf(child_path, sizeof(child_path), "%s/%s", root, child_relative);

    struct stat st;
    if (stat(child_path, &st) != 0) {
      (*read_error_count)++;
      continue;
    }

    if (S_ISDIR(st.st_mode)) {
      scan_directory_recursive(root, child_relative, files, seen, file_count, skipped_count, read_error_count);
      continue;
    }

    if (!S_ISREG(st.st_mode)) continue;
    (*seen)++;
    if (!has_video_suffix(name)) {
      (*skipped_count)++;
      continue;
    }

    if (*file_count > 0) json_append_char(files, ',');
    append_file_json(files, name, child_relative, (long long)st.st_size);
    (*file_count)++;
  }

  closedir(dir);
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

  if (strstr(message, "\"SCAN_DIRECTORY\"")) {
    char path[MAX_PATH_LEN] = {0};
    if (!json_extract_string(message, "path", path, sizeof(path))) {
      write_response("{\"ok\":false,\"error\":\"Missing directory path\"}");
      free(message);
      return 0;
    }

    char resolved[MAX_PATH_LEN] = {0};
    if (!realpath(path, resolved) || !dir_exists(resolved)) {
      write_response("{\"ok\":false,\"error\":\"Directory does not exist\"}");
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

    JsonBuffer files = {0};
    int seen = 0;
    int file_count = 0;
    int skipped_count = 0;
    int read_error_count = 0;
    json_append(&files, "{\"ok\":true,\"files\":[");
    scan_directory_recursive(resolved, "", &files, &seen, &file_count, &skipped_count, &read_error_count);
    char tail[256];
    snprintf(
      tail,
      sizeof(tail),
      "],\"count\":%d,\"seen\":%d,\"skippedCount\":%d,\"readErrorCount\":%d}",
      file_count,
      seen,
      skipped_count,
      read_error_count
    );
    json_append(&files, tail);

    if (files.failed || !files.data) {
      write_response("{\"ok\":false,\"error\":\"Native helper scan response is too large\"}");
    } else {
      write_response(files.data);
    }
    free(files.data);
    free(config);
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
