import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Loader2, Check } from 'lucide-react';
import { api } from '../../lib/api';
import { useHomesStore } from '../../store/useHomesStore';
import { cn } from '../../lib/utils';

interface HomeImageSelectorProps {
  homeId: string;
  currentImage: string | null;
  isOpen: boolean;
  onClose: () => void;
  onImageChange: (newImage: string) => void;
}

// Predefined home floor plan images
const PREDEFINED_IMAGES = Array.from({ length: 19 }, (_, i) => ({
  url: `/homes/home-${i + 1}.jpg`,
  name: `Floor Plan ${i + 1}`,
}));

export function HomeImageSelector({
  homeId,
  currentImage,
  isOpen,
  onClose,
  onImageChange,
}: HomeImageSelectorProps) {
  const { updateHome } = useHomesStore();
  const [selectedImage, setSelectedImage] = useState(PREDEFINED_IMAGES[0].url);
  const [customImageUrl, setCustomImageUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initialize with current image
  useEffect(() => {
    if (currentImage) {
      if (currentImage.startsWith('http')) {
        setCustomImageUrl(currentImage);
        setSelectedImage('');
      } else {
        setSelectedImage(currentImage);
        setCustomImageUrl('');
      }
    } else {
      setSelectedImage(PREDEFINED_IMAGES[0].url);
      setCustomImageUrl('');
    }
  }, [currentImage, isOpen]);

  const handleCustomUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const url = e.target.value;
    setCustomImageUrl(url);
    if (url) {
      setSelectedImage(''); // Clear predefined selection when custom URL is entered
    }
  };

  const handlePredefinedSelect = (url: string) => {
    setSelectedImage(url);
    setCustomImageUrl(''); // Clear custom URL when predefined is selected
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const imageToSave = customImageUrl || selectedImage;

    if (!imageToSave) {
      setError('Please select an image or enter a URL');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      // Update home image via API
      const response = await api.put(`/homes/${homeId}`, {
        image: imageToSave,
      });

      if (response.data) {
        // Update local store
        updateHome(homeId, { image: imageToSave });
        onImageChange(imageToSave);
        onClose();
      }
    } catch (err) {
      console.error('Failed to update home image', err);
      setError('Failed to save image. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const previewImage = customImageUrl || selectedImage;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Select Floor Plan</DialogTitle>
          <DialogDescription>
            Choose a predefined floor plan or enter a custom image URL.
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={handleSubmit}
          className="flex flex-col gap-3 flex-1 overflow-hidden"
        >
          {/* Image Preview - smaller on mobile */}
          <div className="relative w-full h-28 sm:h-40 bg-card/40 rounded-xl overflow-hidden border border-border flex-shrink-0">
            {previewImage ? (
              <img
                src={previewImage}
                alt="Floor Plan Preview"
                className="w-full h-full object-contain"
                onError={(e) => {
                  e.currentTarget.src = '';
                  e.currentTarget.alt = 'Failed to load image';
                }}
              />
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                No image selected
              </div>
            )}
          </div>

          {/* Predefined Images Grid - 3 cols on mobile, 4 on desktop */}
          <div className="flex-1 overflow-y-auto min-h-0">
            <p className="text-xs sm:text-sm font-medium mb-2">Floor Plans</p>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5 sm:gap-2">
              {PREDEFINED_IMAGES.map((image) => (
                <button
                  key={image.url}
                  type="button"
                  onClick={() => handlePredefinedSelect(image.url)}
                  className={cn(
                    'relative aspect-video rounded-md overflow-hidden border-2 transition-all hover:border-primary/50',
                    selectedImage === image.url
                      ? 'border-primary ring-2 ring-primary/30'
                      : 'border-transparent',
                  )}
                >
                  <img
                    src={image.url}
                    alt={image.name}
                    className="w-full h-full object-cover"
                  />
                  {selectedImage === image.url && (
                    <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
                      <Check className="w-4 h-4 sm:w-6 sm:h-6 text-primary" />
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Custom URL Input */}
          <div className="flex-shrink-0 space-y-1">
            <p className="text-xs sm:text-sm font-medium">Or custom URL</p>
            <Input
              type="url"
              placeholder="https://example.com/floor-plan.jpg"
              value={customImageUrl}
              onChange={handleCustomUrlChange}
              className="text-sm"
            />
          </div>

          {/* Error Message */}
          {error && (
            <div className="text-xs text-destructive bg-destructive/10 p-2 rounded flex-shrink-0">
              {error}
            </div>
          )}

          <DialogFooter className="flex-shrink-0 gap-2 sm:gap-0">
            <Button type="button" variant="outline" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
