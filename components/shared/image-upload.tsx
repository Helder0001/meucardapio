'use client'

// components/shared/image-upload.tsx
// Componente de upload de imagem com preview e drag & drop

import { useState, useRef, useCallback } from 'react'
import { Upload, X, Loader2, Image as ImageIcon } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import Image from 'next/image'

interface ImageUploadProps {
  value?: string | null       // URL atual da imagem
  onChange: (url: string) => void
  onRemove?: () => void
  type?: 'product' | 'logo' | 'cover'
  className?: string
  label?: string
  recommendedSize?: string    // ex: "400x400px"
}

export function ImageUpload({
  value,
  onChange,
  onRemove,
  type = 'product',
  className,
  label = 'Imagem',
  recommendedSize,
}: ImageUploadProps) {
  const [isUploading, setIsUploading] = useState(false)
  const [isDragging,  setIsDragging]  = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const upload = useCallback(async (file: File) => {
    // Validar no cliente também (validação real fica no servidor)
    if (!file.type.startsWith('image/')) {
      toast.error('Selecione uma imagem (JPG, PNG ou WebP)')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Imagem muito grande. Máximo 5MB.')
      return
    }

    setIsUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('type', type)

      const res = await fetch('/api/upload', { method: 'POST', body: formData })
      const data = await res.json()

      if (!res.ok || data.error) {
        toast.error(data.error ?? 'Erro ao fazer upload')
        return
      }

      onChange(data.url)
      toast.success('Imagem enviada!')
    } catch {
      toast.error('Erro de conexão. Tente novamente.')
    } finally {
      setIsUploading(false)
    }
  }, [type, onChange])

  const handleFile = (files: FileList | null) => {
    if (files?.[0]) upload(files[0])
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    handleFile(e.dataTransfer.files)
  }

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex items-center gap-2">
        <label className="block text-sm font-medium text-foreground">{label}</label>
        {recommendedSize && (
          <span className="text-xs text-muted-foreground">(tamanho recomendado: {recommendedSize})</span>
        )}
      </div>

      {value ? (
        // Preview da imagem atual
        <div className="relative inline-block">
          <div className={cn(
            'overflow-hidden rounded-xl border border-border bg-muted',
            type === 'logo' ? 'w-24 h-24' : 'w-full h-48'
          )}>
            <Image
              src={value}
              alt="Preview"
              fill={type !== 'logo'}
              width={type === 'logo' ? 96 : undefined}
              height={type === 'logo' ? 96 : undefined}
              className="object-cover"
            />
          </div>
          <button
            type="button"
            onClick={() => { onRemove?.(); onChange('') }}
            className="absolute -top-2 -right-2 w-6 h-6 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center shadow-sm hover:scale-110 transition-transform"
          >
            <X className="h-3 w-3" />
          </button>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="mt-2 text-xs text-primary hover:underline block"
          >
            Trocar imagem
          </button>
        </div>
      ) : (
        // Área de drop
        <div
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          className={cn(
            'border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all',
            isDragging
              ? 'border-primary bg-primary/5'
              : 'border-border hover:border-primary/50 hover:bg-muted/50'
          )}
        >
          {isUploading ? (
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="h-8 w-8 text-primary animate-spin" />
              <p className="text-sm text-muted-foreground">Enviando...</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                {isDragging
                  ? <Upload className="h-5 w-5 text-primary" />
                  : <ImageIcon className="h-5 w-5 text-muted-foreground" />
                }
              </div>
              <p className="text-sm font-medium text-foreground">
                {isDragging ? 'Solte aqui' : 'Clique ou arraste uma imagem'}
              </p>
              <p className="text-xs text-muted-foreground">
                JPG, PNG ou WebP • Máximo 5MB
              </p>
            </div>
          )}
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => handleFile(e.target.files)}
      />
    </div>
  )
}
