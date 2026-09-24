package main

import (
	"context"
	"fmt"
	"path"
	"strings"

	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
)

func (c *archiveHandlingServer) deleteArchivePrefixes(ctx context.Context, destination archiveDestinationInfo, filePaths []string) error {
	client, err := c.newObjectStorageClient(destination.ObjectStorageSite)
	if err != nil {
		return err
	}

	prefixes := make(map[string]struct{}, len(filePaths))
	for _, filePath := range filePaths {
		prefix, err := archiveParentPrefix(filePath)
		if err != nil {
			return err
		}
		prefixes[prefix] = struct{}{}
	}

	for prefix := range prefixes {
		objectsCh := client.ListObjects(ctx, destination.ObjectStorageBucket, minio.ListObjectsOptions{
			Prefix:    prefix,
			Recursive: true,
		})
		for object := range objectsCh {
			if object.Err != nil {
				return fmt.Errorf("削除対象オブジェクトの列挙に失敗しました：bucket=%q prefix=%q err=%w", destination.ObjectStorageBucket, prefix, object.Err)
			}
			if err := client.RemoveObject(ctx, destination.ObjectStorageBucket, object.Key, minio.RemoveObjectOptions{}); err != nil {
				return fmt.Errorf("オブジェクト削除に失敗しました：bucket=%q key=%q err=%w", destination.ObjectStorageBucket, object.Key, err)
			}
		}
	}

	return nil
}

func (c *archiveHandlingServer) newObjectStorageClient(site string) (*minio.Client, error) {
	credential, ok := c.objectStorageCreds[site]
	if !ok || credential.AccessKeyID == "" || credential.SecretAccessKey == "" {
		return nil, fmt.Errorf("サイト%sのオブジェクトストレージ認証情報が設定されていません。", site)
	}
	endpoint := objectStorageEndpoint(site)
	if endpoint == "" {
		return nil, fmt.Errorf("未対応のオブジェクトストレージサイトです：%s", site)
	}

	client, err := minio.New(endpoint, &minio.Options{
		Creds:  credentials.NewStaticV4(credential.AccessKeyID, credential.SecretAccessKey, ""),
		Secure: true,
		Region: site,
	})
	if err != nil {
		return nil, fmt.Errorf("オブジェクトストレージクライアントの初期化に失敗しました：site=%q err=%w", site, err)
	}

	return client, nil
}

func objectStorageEndpoint(site string) string {
	switch site {
	case "jp-north-1":
		return jpNorth1S3Endpoint
	case "jp-east-1":
		return jpEast1S3Endpoint
	default:
		return ""
	}
}

func archiveParentPrefix(filePath string) (string, error) {
	objectPath := strings.Trim(path.Clean("/"+strings.TrimSpace(filePath)), "/")
	if objectPath == "" || objectPath == "." {
		return "", fmt.Errorf("filePathsからオブジェクトパスを取得できません：%q", filePath)
	}

	dir := strings.Trim(path.Dir(objectPath), "/")
	if dir == "" || dir == "." {
		return "", fmt.Errorf("削除対象の親フォルダを取得できません：%q", filePath)
	}

	return dir + "/", nil
}
