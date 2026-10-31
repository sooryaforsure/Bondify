package com.frnd.app.ui.screens

import androidx.compose.animation.core.*
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay

enum class CallState {
    IDLE, SEARCHING, CONNECTED
}

enum class MatchType {
    AUDIO, VIDEO
}

@Composable
fun MatchmakingScreen() {
    var callState by remember { mutableStateOf(CallState.IDLE) }
    var matchType by remember { mutableStateOf(MatchType.AUDIO) }
    var isMuted by remember { mutableStateOf(false) }
    var isCameraOff by remember { mutableStateOf(false) }
    var callSeconds by remember { mutableStateOf(0) }
    var partnerName by remember { mutableStateOf("Online Friend") }

    LaunchedEffect(callState) {
        if (callState == CallState.SEARCHING) {
            // Simulate matching after delay
            delay(3500)
            callState = CallState.CONNECTED
            callSeconds = 0
            partnerName = listOf("Anjana R.", "Midhun K.", "Gokul S.", "Reshma P.").random()
        }
    }

    LaunchedEffect(callState) {
        if (callState == CallState.CONNECTED) {
            while (callState == CallState.CONNECTED) {
                delay(1000)
                callSeconds++
            }
        }
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color(0xFF030712))
            .padding(16.dp),
        contentAlignment = Alignment.Center
    ) {
        when (callState) {
            CallState.IDLE -> {
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.Center
                ) {
                    // Audio / Video Toggle
                    Row(
                        modifier = Modifier
                            .clip(RoundedCornerShape(24.dp))
                            .background(Color(0xFF111827))
                            .padding(4.dp),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Button(
                            onClick = { matchType = MatchType.AUDIO },
                            colors = ButtonDefaults.buttonColors(
                                containerColor = if (matchType == MatchType.AUDIO) Color(0xFF6366F1) else Color.Transparent
                            ),
                            shape = RoundedCornerShape(20.dp)
                        ) {
                            Icon(Icons.Default.Headset, contentDescription = null, modifier = Modifier.size(16.dp))
                            Spacer(modifier = Modifier.width(6.dp))
                            Text("Audio", fontSize = 12.sp)
                        }

                        Button(
                            onClick = { matchType = MatchType.VIDEO },
                            colors = ButtonDefaults.buttonColors(
                                containerColor = if (matchType == MatchType.VIDEO) Color(0xFFEC4899) else Color.Transparent
                            ),
                            shape = RoundedCornerShape(20.dp)
                        ) {
                            Icon(Icons.Default.Videocam, contentDescription = null, modifier = Modifier.size(16.dp))
                            Spacer(modifier = Modifier.width(6.dp))
                            Text("Video", fontSize = 12.sp)
                        }
                    }

                    Spacer(modifier = Modifier.height(32.dp))

                    Box(
                        modifier = Modifier
                            .size(120.dp)
                            .clip(CircleShape)
                            .background(if (matchType == MatchType.VIDEO) Color(0xFF831843) else Color(0xFF1E1B4B)),
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(
                            if (matchType == MatchType.VIDEO) Icons.Default.Videocam else Icons.Default.Mic,
                            contentDescription = "Call Icon",
                            tint = if (matchType == MatchType.VIDEO) Color(0xFFF472B6) else Color(0xFF818CF8),
                            modifier = Modifier.size(54.dp)
                        )
                    }

                    Spacer(modifier = Modifier.height(24.dp))
                    Text(
                        if (matchType == MatchType.VIDEO) "Random Video Call" else "Random Audio Call",
                        style = MaterialTheme.typography.headlineSmall,
                        color = Color.White
                    )
                    Spacer(modifier = Modifier.height(6.dp))
                    Text(
                        if (matchType == MatchType.VIDEO) "ഓൺലൈനിലുള്ള പുതിയ സുഹൃത്തുക്കളുമായി തത്സമയ വീഡിയോ കോൾ" else "ഓൺലൈനിലുള്ള സുഹൃത്തുക്കളുമായി തത്സമയ ഓഡിയോ കോൾ",
                        style = MaterialTheme.typography.bodySmall,
                        color = Color(0xFF9CA3AF),
                        fontSize = 12.sp
                    )

                    Spacer(modifier = Modifier.height(32.dp))
                    Button(
                        onClick = { callState = CallState.SEARCHING },
                        modifier = Modifier
                            .fillMaxWidth(0.85f)
                            .height(54.dp),
                        shape = RoundedCornerShape(27.dp),
                        colors = ButtonDefaults.buttonColors(
                            containerColor = if (matchType == MatchType.VIDEO) Color(0xFFEC4899) else Color(0xFF6366F1)
                        )
                    ) {
                        Icon(
                            if (matchType == MatchType.VIDEO) Icons.Default.Videocam else Icons.Default.PhoneInTalk,
                            contentDescription = null,
                            modifier = Modifier.size(20.dp)
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(if (matchType == MatchType.VIDEO) "Connect Random Video" else "Connect Random Friend", fontSize = 16.sp)
                    }
                }
            }

            CallState.SEARCHING -> {
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.Center
                ) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(80.dp),
                        color = if (matchType == MatchType.VIDEO) Color(0xFFEC4899) else Color(0xFFA855F7),
                        strokeWidth = 6.dp
                    )
                    Spacer(modifier = Modifier.height(32.dp))
                    Text(
                        if (matchType == MatchType.VIDEO) "Finding a Video Friend..." else "Finding an Online Friend...",
                        style = MaterialTheme.typography.titleMedium,
                        color = Color.White
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    Text("Matching with active online queue", style = MaterialTheme.typography.bodySmall, color = Color(0xFF9CA3AF))
                    Spacer(modifier = Modifier.height(32.dp))
                    OutlinedButton(
                        onClick = { callState = CallState.IDLE },
                        shape = RoundedCornerShape(20.dp)
                    ) {
                        Text("Cancel")
                    }
                }
            }

            CallState.CONNECTED -> {
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    modifier = Modifier.fillMaxSize()
                ) {
                    if (matchType == MatchType.VIDEO) {
                        // Remote Video Viewport with PiP Local Preview
                        Box(
                            modifier = Modifier
                                .weight(1f)
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(24.dp))
                                .background(Color.Black),
                            contentAlignment = Alignment.Center
                        ) {
                            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                Box(
                                    modifier = Modifier
                                        .size(80.dp)
                                        .clip(CircleShape)
                                        .background(Color(0xFF8B5CF6)),
                                    contentAlignment = Alignment.Center
                                ) {
                                    Icon(Icons.Default.Person, contentDescription = null, tint = Color.White, modifier = Modifier.size(48.dp))
                                }
                                Spacer(modifier = Modifier.height(8.dp))
                                Text(partnerName, color = Color.White, fontWeight = androidx.compose.ui.text.font.FontWeight.Bold)
                                Text("Live WebRTC Video Stream", color = Color(0xFF34D399), fontSize = 11.sp)
                            }

                            // Picture-in-Picture Local Camera Preview
                            Box(
                                modifier = Modifier
                                    .align(Alignment.BottomEnd)
                                    .padding(16.dp)
                                    .size(width = 90.dp, height = 120.dp)
                                    .clip(RoundedCornerShape(12.dp))
                                    .background(Color(0xFF1F2937)),
                                contentAlignment = Alignment.Center
                            ) {
                                if (isCameraOff) {
                                    Text("Camera Off", color = Color.Gray, fontSize = 10.sp)
                                } else {
                                    Text("You (Live)", color = Color(0xFF818CF8), fontSize = 10.sp)
                                }
                            }
                        }
                    } else {
                        // Audio Only Viewport
                        Spacer(modifier = Modifier.weight(0.2f))
                        Box(
                            modifier = Modifier
                                .size(100.dp)
                                .clip(CircleShape)
                                .background(Color(0xFF10B981)),
                            contentAlignment = Alignment.Center
                        ) {
                            Icon(Icons.Default.Person, contentDescription = null, tint = Color.White, modifier = Modifier.size(60.dp))
                        }

                        Spacer(modifier = Modifier.height(16.dp))
                        Text(partnerName, style = MaterialTheme.typography.titleLarge, color = Color.White)
                        Text("WebRTC 1-on-1 Audio Call", style = MaterialTheme.typography.bodySmall, color = Color(0xFF34D399))
                        Spacer(modifier = Modifier.weight(0.2f))
                    }

                    Spacer(modifier = Modifier.height(12.dp))
                    val mins = String.format("%02d", callSeconds / 60)
                    val secs = String.format("%02d", callSeconds % 60)
                    Text("$mins:$secs", style = MaterialTheme.typography.headlineMedium, color = Color(0xFFE5E7EB))

                    Spacer(modifier = Modifier.height(24.dp))

                    Row(
                        horizontalArrangement = Arrangement.spacedBy(16.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        // Mute Mic
                        IconButton(
                            onClick = { isMuted = !isMuted },
                            modifier = Modifier
                                .size(56.dp)
                                .clip(CircleShape)
                                .background(if (isMuted) Color(0xFFE11D48) else Color(0xFF1F2937))
                        ) {
                            Icon(
                                if (isMuted) Icons.Default.MicOff else Icons.Default.Mic,
                                contentDescription = "Mute",
                                tint = Color.White
                            )
                        }

                        // Toggle Camera (in video mode)
                        if (matchType == MatchType.VIDEO) {
                            IconButton(
                                onClick = { isCameraOff = !isCameraOff },
                                modifier = Modifier
                                    .size(56.dp)
                                    .clip(CircleShape)
                                    .background(if (isCameraOff) Color(0xFFE11D48) else Color(0xFF1F2937))
                            ) {
                                Icon(
                                    if (isCameraOff) Icons.Default.VideocamOff else Icons.Default.Videocam,
                                    contentDescription = "Camera",
                                    tint = Color.White
                                )
                            }
                        }

                        // Next Person
                        Button(
                            onClick = {
                                callState = CallState.SEARCHING
                            },
                            shape = RoundedCornerShape(28.dp),
                            colors = ButtonDefaults.buttonColors(
                                containerColor = if (matchType == MatchType.VIDEO) Color(0xFFEC4899) else Color(0xFF6366F1)
                            ),
                            modifier = Modifier.height(56.dp)
                        ) {
                            Icon(Icons.Default.SkipNext, contentDescription = null)
                            Spacer(modifier = Modifier.width(6.dp))
                            Text("Next")
                        }

                        // End Call
                        IconButton(
                            onClick = { callState = CallState.IDLE },
                            modifier = Modifier
                                .size(56.dp)
                                .clip(CircleShape)
                                .background(Color(0xFFDC2626))
                        ) {
                            Icon(Icons.Default.CallEnd, contentDescription = "End Call", tint = Color.White)
                        }
                    }

                    Spacer(modifier = Modifier.height(16.dp))
                }
            }
        }
    }
}
