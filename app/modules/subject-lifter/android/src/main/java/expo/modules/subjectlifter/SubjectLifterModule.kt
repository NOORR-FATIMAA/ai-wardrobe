package expo.modules.subjectlifter

import android.graphics.Bitmap
import android.net.Uri
import com.google.android.gms.common.ConnectionResult
import com.google.android.gms.common.GoogleApiAvailability
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.segmentation.subject.SubjectSegmentation
import com.google.mlkit.vision.segmentation.subject.SubjectSegmenterOptions
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.io.FileOutputStream
import java.util.UUID
import java.util.concurrent.Executors

internal class ImageLoadException(cause: Throwable) :
  CodedException("Could not read the image", cause)

internal class SegmentationException(cause: Throwable) :
  CodedException("Background removal failed", cause)

class SubjectLifterModule : Module() {
  private val segmenter by lazy {
    SubjectSegmentation.getClient(
      SubjectSegmenterOptions.Builder().enableForegroundBitmap().build()
    )
  }

  // Encoding the PNG happens off the main thread.
  private val worker = Executors.newSingleThreadExecutor()

  override fun definition() = ModuleDefinition {
    Name("SubjectLifter")

    AsyncFunction("isAvailableAsync") {
      val context = appContext.reactContext ?: return@AsyncFunction false
      GoogleApiAvailability.getInstance().isGooglePlayServicesAvailable(context) == ConnectionResult.SUCCESS
    }

    AsyncFunction("liftSubjectAsync") { uri: String, promise: Promise ->
      val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      val image = try {
        InputImage.fromFilePath(context, Uri.parse(uri))
      } catch (e: Exception) {
        throw ImageLoadException(e)
      }

      segmenter.process(image)
        .addOnSuccessListener(worker) { result ->
          val cropped = result.foregroundBitmap?.let(::cropToSubject)
          if (cropped == null) {
            promise.resolve(null)
            return@addOnSuccessListener
          }
          val file = File(context.cacheDir, "lifted-${UUID.randomUUID()}.png")
          FileOutputStream(file).use { cropped.compress(Bitmap.CompressFormat.PNG, 100, it) }
          promise.resolve(Uri.fromFile(file).toString())
        }
        .addOnFailureListener(worker) { e -> promise.reject(SegmentationException(e)) }
    }

    OnDestroy {
      worker.shutdown()
    }
  }

  /** Crops a transparent-background bitmap to the visible subject plus a small margin; null if empty. */
  private fun cropToSubject(bitmap: Bitmap): Bitmap? {
    val width = bitmap.width
    val height = bitmap.height
    val pixels = IntArray(width * height)
    bitmap.getPixels(pixels, 0, width, 0, 0, width, height)

    var left = width
    var top = height
    var right = -1
    var bottom = -1
    for (y in 0 until height) {
      val row = y * width
      for (x in 0 until width) {
        if ((pixels[row + x] ushr 24) > 16) {
          if (x < left) left = x
          if (x > right) right = x
          if (y < top) top = y
          if (y > bottom) bottom = y
        }
      }
    }
    if (right < 0) return null

    val margin = (maxOf(right - left, bottom - top) * 0.03).toInt()
    left = maxOf(0, left - margin)
    top = maxOf(0, top - margin)
    right = minOf(width - 1, right + margin)
    bottom = minOf(height - 1, bottom + margin)
    return Bitmap.createBitmap(bitmap, left, top, right - left + 1, bottom - top + 1)
  }
}
