Pod::Spec.new do |s|
  s.name           = 'SubjectLifter'
  s.version        = '1.0.0'
  s.summary        = 'On-device subject lifting (background removal) for clothing photos'
  s.description    = 'Wraps Apple Vision foreground instance masks to cut the main subject out of a photo.'
  s.author         = ''
  s.homepage       = 'https://docs.expo.dev/modules/'
  s.platforms      = {
    :ios => '15.1'
  }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  # Swift/Objective-C compatibility
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
