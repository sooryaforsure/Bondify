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

@Composable
fun MatchmakingScreen() {
    var callState by remember { mutableStateOf(CallState.IDLE) }
    var isMuted by remember { mutableStateOf(false) }
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
            .padding(24.dp),
        contentAlignment = Alignment.Center
    ) {
        when (callState) {
            CallState.IDLE -> {
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.Center
                ) {
                    Box(
                        modifier = Modifier
                            .size(120.dp)
                            .clip(CircleShape)
                            .background(Color(0xFF1E1B4B)),
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(
                            Icons.Default.Mic,
                            contentDescription = "Mic",
                            tint = Color(0xFF818CF8),
                            modifier = Modifier.size(54.dp)
                        )
                    }

                    Spacer(modifier = Modifier.height(28.dp))
                    Text("Connect to Random Friends", style = MaterialTheme.typography.headlineSmall, color = Color.White)
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(
                        "ഓൺലൈനിലുള്ള സുഹൃത്തുക്കളുമായി തത്സമയം സംസാരിക്കാൻ ക്ലിക്ക് ചെയ്യുക",
                        style = MaterialTheme.typography.bodySmall,
                        color = Color(0xFF9CA3AF),
                        fontSize = 12.sp
                    )

                    Spacer(modifier = Modifier.height(36.dp))
                    Button(
                        onClick = { callState = CallState.SEARCHING },
                        modifier = Modifier
                            .fillMaxWidth(0.85f)
                            .height(54.dp),
                        shape = RoundedCornerShape(27.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF6366F1))
                    ) {
                        Icon(Icons.Default.PhoneInTalk, contentDescription = null, modifier = Modifier.size(20.dp))
                        Spacer(modifier = Modifier.width(8.dp))
                        Text("Connect Random Friend", fontSize = 16.sp)
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
                        color = Color(0xFFA855F7),
                        strokeWidth = 6.dp
                    )
                    Spacer(modifier = Modifier.height(32.dp))
                    Text("Finding an Online Friend...", style = MaterialTheme.typography.titleMedium, color = Color.White)
                    Spacer(modifier = Modifier.height(8.dp))
                    Text("Waiting for available match in queue", style = MaterialTheme.typography.bodySmall, color = Color(0xFF9CA3AF))
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
                    verticalArrangement = Arrangement.Center
                ) {
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

                    Spacer(modifier = Modifier.height(16.dp))
                    val mins = String.format("%02d", callSeconds / 60)
                    val secs = String.format("%02d", callSeconds % 60)
                    Text("$mins:$secs", style = MaterialTheme.typography.headlineMedium, color = Color(0xFFE5E7EB))

                    Spacer(modifier = Modifier.height(40.dp))

                    Row(
                        horizontalArrangement = Arrangement.spacedBy(16.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        // Mute
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

                        // Next Person
                        Button(
                            onClick = {
                                callState = CallState.SEARCHING
                            },
                            shape = RoundedCornerShape(28.dp),
                            colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF6366F1)),
                            modifier = Modifier.height(56.dp)
                        ) {
                            Icon(Icons.Default.SkipNext, contentDescription = null)
                            Spacer(modifier = Modifier.width(6.dp))
                            Text("Next Friend")
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
                }
            }
        }
    }
}
