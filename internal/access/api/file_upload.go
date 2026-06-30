package api

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/gin-gonic/gin"
)

const maxUploadSize = 50 << 20 // 50 MB

func (s *Server) handleFileUpload(c *gin.Context) {
	if s.fileUploadDir == "" {
		c.JSON(http.StatusServiceUnavailable, gin.H{
			"error":   "upload_unavailable",
			"message": "file upload is not configured",
		})
		return
	}

	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, maxUploadSize)

	file, header, err := c.Request.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error":   "invalid_request",
			"message": "failed to read uploaded file: " + err.Error(),
		})
		return
	}
	defer file.Close()

	ext := strings.ToLower(filepath.Ext(header.Filename))
	if ext == "" {
		ext = ".bin"
	}

	hash := sha256.New()
	tmp, err := os.CreateTemp(s.fileUploadDir, "upload-*"+ext)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error":   "internal_error",
			"message": "failed to create temp file",
		})
		return
	}
	defer tmp.Close()

	written, err := io.Copy(io.MultiWriter(tmp, hash), file)
	if err != nil {
		os.Remove(tmp.Name())
		c.JSON(http.StatusInternalServerError, gin.H{
			"error":   "internal_error",
			"message": "failed to write file",
		})
		return
	}

	sum := hex.EncodeToString(hash.Sum(nil))
	finalName := fmt.Sprintf("%s%s", sum[:16], ext)
	finalPath := filepath.Join(s.fileUploadDir, finalName)

	if err := os.Rename(tmp.Name(), finalPath); err != nil {
		os.Remove(tmp.Name())
		c.JSON(http.StatusInternalServerError, gin.H{
			"error":   "internal_error",
			"message": "failed to persist file",
		})
		return
	}

	_ = os.Chmod(finalPath, 0644)

	contentType := header.Header.Get("Content-Type")
	if contentType == "" {
		contentType = "application/octet-stream"
	}

	c.JSON(http.StatusOK, gin.H{
		"file_id":  finalName,
		"url":      "/files/" + finalName,
		"size":     written,
		"name":     header.Filename,
		"mime":     contentType,
	})
}
